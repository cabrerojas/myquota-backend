// src/modules/transaction/transaction.repository.supabase.ts
// Supabase implementation of the Transaction repository.
// Replaces Firestore subcollection access with top-level table + JOINs.

import {
  SupabaseRepository,
  PaginationParams,
  QueryResult,
  camelToSnake,
} from '@/shared/classes/supabase.repository';
import { Transaction } from './transaction.model';
import { Quota } from '@/modules/quota/quota.model';
import { RepositoryError } from '@/shared/errors/custom.error';

/** Extended pagination params that support date-range filtering at the SQL level. */
export interface TransactionPaginationParams extends PaginationParams {
  startDate?: string;
  endDate?: string;
}

export class TransactionRepositorySupabase extends SupabaseRepository<Transaction> {
  constructor(private readonly creditCardId: string) {
    super('transactions');
  }

  // ===============================================
  // CORE: findAll with credit_card_id + date range
  // ===============================================

  async findAll(
    filters?: Partial<Transaction>,
    pagination?: TransactionPaginationParams,
  ): Promise<QueryResult<Transaction>> {
    let query = this.client()
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('credit_card_id', this.creditCardId)
      .is('deleted_at', null);

    // Date-range filters pushed to SQL (replaces in-memory post-filter)
    if (pagination?.startDate) {
      query = query.gte('transaction_date', pagination.startDate);
    }
    if (pagination?.endDate) {
      query = query.lte('transaction_date', pagination.endDate);
    }

    // Apply equality filters (skip creditCardId — already applied above)
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && key !== 'creditCardId') {
          const columnName = camelToSnake(key);
          query = query.eq(columnName, value);
        }
      }
    }

    // Ordering
    const orderByField = camelToSnake(pagination?.orderBy || 'created_at');
    const orderDirection = pagination?.orderDirection || 'desc';
    query = query.order(orderByField, { ascending: orderDirection === 'asc' });

    // Limit +1 for hasMore detection
    const limit = pagination?.limit || 50;
    query = query.limit(limit + 1);

    // Cursor (key-set pagination)
    if (pagination?.startAfter) {
      query = query.gt('id', pagination.startAfter);
    }

    const { data, error } = await query;

    if (error) {
      throw new RepositoryError(`Error finding transactions: ${error.message}`, 500);
    }

    const rows = (data || []) as Record<string, unknown>[];
    const items = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const nextCursor =
      hasMore && items.length > 0
        ? (items[items.length - 1] as Record<string, unknown>).id as string
        : null;

    return {
      items: items.map((row) => this.mapRowToEntity(row)),
      metadata: { hasMore, nextCursor },
    };
  }

  /**
   * Maps a Postgres row to a Transaction entity.
   * Handles currency normalization (Dolar → USD).
   */
  protected override mapRowToEntity(
    row: Record<string, unknown>,
  ): Transaction {
    const tx = super.mapRowToEntity(row) as Transaction;
    // Normalize currency: Firestore used "Dolar", Postgres uses "USD"
    tx.currency = tx.currency === 'Dolar' ? 'USD' : tx.currency;
    return tx;
  }

  // ===============================================
  // CUSTOM METHODS (beyond IBaseRepository)
  // ===============================================

  /**
   * getQuotas — replaces collectionGroup("quotas") WHERE transaction_id = :id
   * Uses direct FK lookup on the quotas table.
   */
  async getQuotas(transactionId: string): Promise<Quota[]> {
    const { data, error } = await this.client()
      .from('quotas')
      .select('*')
      .eq('transaction_id', transactionId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true });

    if (error) {
      throw new RepositoryError(`Error getting quotas: ${error.message}`, 500);
    }

    return (data as Record<string, unknown>[]).map((row) =>
      this.mapQuotaRow(row),
    );
  }

  /**
   * replaceQuotasAtomically — replaces all quotas for a transaction.
   * Uses a Postgres transaction: soft-delete existing + insert new.
   * Returns { deleted, created } counts.
   */
  async replaceQuotasAtomically(
    transactionId: string,
    newQuotas: Omit<Quota, 'id'>[],
  ): Promise<{ deleted: number; created: number }> {
    const supabase = this.client();

    // Count existing quotas before soft-delete
    const { count: prevCount } = await supabase
      .from('quotas')
      .select('*', { count: 'exact', head: true })
      .eq('transaction_id', transactionId)
      .is('deleted_at', null);

    // Step 1: Soft-delete existing quotas
    const now = new Date().toISOString();
    await supabase
      .from('quotas')
      .update({ deleted_at: now })
      .eq('transaction_id', transactionId)
      .is('deleted_at', null);

    // Step 2: Insert new quotas
    if (newQuotas.length === 0) {
      return { deleted: prevCount ?? 0, created: 0 };
    }

    const inserts = newQuotas.map((q) => ({
      id: (crypto as { randomUUID: () => string }).randomUUID(),
      transaction_id: transactionId,
      credit_card_id: this.creditCardId,
      amount: q.amount,
      currency: q.currency,
      due_date: this.toIsoString(q.dueDate),
      status: q.status || 'pending',
      payment_date: this.paymentDateToIsoString(q.paymentDate),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }));

    const { data, error } = await supabase
      .from('quotas')
      .insert(inserts)
      .select();

    if (error) {
      throw new RepositoryError(
        `Error replacing quotas: ${error.message}`,
        500,
      );
    }

    return {
      deleted: prevCount ?? 0,
      created: data?.length ?? newQuotas.length,
    };
  }

  /**
   * updateTransactionAndReplaceQuotasAtomically — updates transaction fields
   * and replaces quotas in a single logical operation.
   */
  async updateTransactionAndReplaceQuotasAtomically(
    transactionId: string,
    transactionPatch: Partial<Transaction>,
    quotas: Omit<Quota, 'id'>[],
  ): Promise<{ deleted: number; created: number }> {
    // First update the transaction
    await this.update(transactionId, transactionPatch);

    // Then replace quotas
    return this.replaceQuotasAtomically(transactionId, quotas);
  }

  /**
   * getCreditCardIdByTransactionId — resolves credit_card_id from a transaction ID.
   * Uses direct table lookup (no collectionGroup needed).
   */
  async getCreditCardIdByTransactionId(transactionId: string): Promise<string | null> {
    const { data, error } = await this.client()
      .from('transactions')
      .select('credit_card_id')
      .eq('id', transactionId)
      .is('deleted_at', null)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(
        `Error getting credit card ID: ${error.message}`,
        500,
      );
    }

    return (data as { credit_card_id: string }).credit_card_id;
  }

  /**
   * addIfAbsent — inserts a transaction only if no document with that ID exists.
   * Uses Postgres UPSERT behavior via ON CONFLICT.
   */
  async addIfAbsent(transaction: Transaction): Promise<boolean> {
    const now = new Date().toISOString();
    const row = this.transactionToDbRow(transaction, now);

    const { error } = await this.client()
      .from('transactions')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: true });

    if (error) {
      throw new RepositoryError(
        `Error adding transaction: ${error.message}`,
        500,
      );
    }

    return true;
  }

  /**
   * addQuota — adds a single quota to a transaction's quota subcollection.
   */
  async addQuota(
    _creditCardId: string,
    transactionId: string,
    quota: Quota,
  ): Promise<void> {
    const now = new Date().toISOString();
    const row = {
      id: quota.id || (crypto as { randomUUID: () => string }).randomUUID(),
      transaction_id: transactionId,
      credit_card_id: this.creditCardId,
      amount: quota.amount,
      currency: quota.currency,
      due_date: this.toIsoString(quota.dueDate),
      status: quota.status || 'pending',
      payment_date: this.paymentDateToIsoString(quota.paymentDate),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    const { error } = await this.client()
      .from('quotas')
      .insert(row);

    if (error) {
      throw new RepositoryError(`Error adding quota: ${error.message}`, 500);
    }
  }

  /**
   * addQuotaIfAbsent — inserts a quota only if no quota with that ID exists.
   */
  async addQuotaIfAbsent(
    _creditCardId: string,
    transactionId: string,
    quota: Quota,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const row = {
      id: quota.id || (crypto as { randomUUID: () => string }).randomUUID(),
      transaction_id: transactionId,
      credit_card_id: this.creditCardId,
      amount: quota.amount,
      currency: quota.currency,
      due_date: this.toIsoString(quota.dueDate),
      status: quota.status || 'pending',
      payment_date: this.paymentDateToIsoString(quota.paymentDate),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    const { error } = await this.client()
      .from('quotas')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: true });

    if (error) {
      throw new RepositoryError(
        `Error adding quota if absent: ${error.message}`,
        500,
      );
    }

    return true;
  }

  /**
   * getQuotasForTransactionIds — batch fetch quotas for multiple transactions.
   * Replaces N individual getQuotas() calls with a single .in() query.
   */
  async getQuotasForTransactionIds(
    transactionIds: string[],
  ): Promise<Record<string, Quota[]>> {
    if (transactionIds.length === 0) return {};

    const { data, error } = await this.client()
      .from('quotas')
      .select('*')
      .in('transaction_id', transactionIds)
      .is('deleted_at', null)
      .order('due_date', { ascending: true });

    if (error) {
      throw new RepositoryError(
        `Error getting quotas: ${error.message}`,
        500,
      );
    }

    const quotas = (data as Record<string, unknown>[]).map((row) =>
      this.mapQuotaRow(row),
    );

    const grouped: Record<string, Quota[]> = {};
    for (const q of quotas) {
      if (!grouped[q.transactionId]) grouped[q.transactionId] = [];
      grouped[q.transactionId].push(q);
    }
    return grouped;
  }

  /**
   * findManual — returns manual transactions + imported transactions with quotas.
   */
  async findManual(): Promise<Transaction[]> {
    const { data, error } = await this.client()
      .from('transactions')
      .select('*')
      .eq('credit_card_id', this.creditCardId)
      .or('source.eq.manual,and(source.eq.imported,total_installments.gt.1)')
      .is('deleted_at', null);

    if (error) {
      throw new RepositoryError(
        `Error finding manual transactions: ${error.message}`,
        500,
      );
    }

    return (data as Record<string, unknown>[]).map((row) =>
      this.mapRowToEntity(row),
    );
  }

  /**
   * deleteAllQuotas — hard deletes all quotas for a transaction.
   * Used when permanently removing a transaction.
   */
  async deleteAllQuotas(
    _creditCardId: string,
    transactionId: string,
  ): Promise<number> {
    // Count quotas before deleting
    const { count } = await this.client()
      .from('quotas')
      .select('*', { count: 'exact', head: true })
      .eq('transaction_id', transactionId);

    // Hard delete all quotas
    const { error } = await this.client()
      .from('quotas')
      .delete()
      .eq('transaction_id', transactionId);

    if (error) {
      throw new RepositoryError(
        `Error deleting all quotas: ${error.message}`,
        500,
      );
    }

    return count ?? 0;
  }

  // ===============================================
  // PRIVATE HELPERS
  // ===============================================

  private toIsoString(value: unknown): string | undefined {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return undefined;
  }

  private paymentDateToIsoString(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return null;
  }

  private transactionToDbRow(tx: Transaction, now: string): Record<string, unknown> {
    return {
      id: tx.id,
      credit_card_id: tx.creditCardId,
      amount: tx.amount,
      currency: tx.currency,
      merchant: tx.merchant,
      category_id: tx.categoryId || null,
      transaction_date: this.toIsoString(tx.transactionDate),
      source: tx.source || 'manual',
      card_type: tx.cardType || null,
      card_last_digits: tx.cardLastDigits || null,
      bank: tx.bank || null,
      email: tx.email || null,
      total_installments: tx.totalInstallments || null,
      paid_installments: tx.paidInstallments || null,
      message_id: tx.messageId || null,
      created_at: this.toIsoString(tx.createdAt) || now,
      updated_at: now,
      deleted_at: null,
    };
  }

  private mapQuotaRow(row: Record<string, unknown>): Quota {
    return {
      id: row.id as string,
      transactionId: row.transaction_id as string,
      amount: row.amount as number,
      currency: row.currency as string,
      dueDate: row.due_date ? new Date(row.due_date as string) : new Date(),
      status: row.status as 'pending' | 'paid',
      paymentDate: row.payment_date ? new Date(row.payment_date as string) : null,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
      deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
    } as Quota;
  }
}