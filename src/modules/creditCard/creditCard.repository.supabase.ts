// src/modules/creditCard/creditCard.repository.supabase.ts
// Supabase implementation of the CreditCard repository.

import { SupabaseRepository, QueryResult, PaginationParams } from '@/shared/classes/supabase.repository';
import { CreditCard } from './creditCard.model';
import { Transaction } from '@/modules/transaction/transaction.model';
import { RepositoryError } from '@/shared/errors/custom.error';

export class CreditCardRepositorySupabase extends SupabaseRepository<CreditCard> {
  constructor(private readonly userId: string) {
    super('credit_cards');
  }

  /**
   * getTransactions — returns all transactions for this credit card.
   * Replaces Firestore subcollection access with a direct JOIN query.
   */
  async getTransactions(creditCardId: string): Promise<Transaction[]> {
    const { data, error } = await this.client()
      .from('transactions')
      .select('*')
      .eq('credit_card_id', creditCardId)
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false });

    if (error) {
      throw new RepositoryError(
        `Error getting transactions: ${error.message}`,
        500,
      );
    }

    return (data as Record<string, unknown>[]).map((row) =>
      this.mapTransactionRow(row),
    );
  }

  /**
   * addTransaction — inserts or merges a transaction for this credit card.
   * Uses upsert to handle idempotency (email imports may retry).
   */
  async addTransaction(
    _creditCardId: string,
    transaction: Transaction,
  ): Promise<void> {
    const now = new Date().toISOString();
    const row = this.transactionToDbRow(transaction, now);

    const { error } = await this.client()
      .from('transactions')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      throw new RepositoryError(
        `Error adding transaction: ${error.message}`,
        500,
      );
    }
  }

  /**
   * addTransactionIfAbsent — inserts a transaction only if ID doesn't exist.
   */
  async addTransactionIfAbsent(
    _creditCardId: string,
    transaction: Transaction,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const row = this.transactionToDbRow(transaction, now);

    const { error } = await this.client()
      .from('transactions')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: true });

    if (error) {
      throw new RepositoryError(
        `Error adding transaction if absent: ${error.message}`,
        500,
      );
    }

    return true;
  }

  /**
   * getCreditCardIdByTransactionId — resolves the credit card ID
   * from a transaction ID using a direct lookup.
   */
  async getCreditCardIdByTransactionId(
    transactionId: string,
  ): Promise<string | null> {
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
   * findAll — returns all credit cards for the user with pagination.
   * Overrides base to inject user_id filter.
   */
  async findAll(
    filters?: Partial<CreditCard>,
    pagination?: PaginationParams,
  ): Promise<QueryResult<CreditCard>> {
    const userFilter = { userId: this.userId } as Partial<CreditCard>;
    const mergedFilters = { ...userFilter, ...filters };

    return super.findAll(mergedFilters, pagination);
  }

  /**
   * findById — returns a credit card by ID, ensuring it belongs to this user.
   */
  async findById(id: string): Promise<CreditCard | null> {
    const { data, error } = await this.client()
      .from('credit_cards')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.userId)
      .is('deleted_at', null)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(`Error finding credit card: ${error.message}`, 500);
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * create — inserts a new credit card for this user.
   */
  async create(
    data: Omit<CreditCard, keyof import('@/shared/interfaces/base.repository').IBaseEntity> &
      Partial<import('@/shared/interfaces/base.repository').IBaseEntity>,
  ): Promise<CreditCard> {
    const cardData = {
      ...data,
      userId: this.userId,
    } as Omit<CreditCard, keyof import('@/shared/interfaces/base.repository').IBaseEntity> &
      Partial<import('@/shared/interfaces/base.repository').IBaseEntity>;

    return super.create(cardData);
  }

  // ===============================================
  // PRIVATE HELPERS
  // ===============================================

  private toIsoString(value: unknown): string | undefined {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return undefined;
  }

  private mapTransactionRow(row: Record<string, unknown>): Transaction {
    return {
      id: row.id as string,
      creditCardId: row.credit_card_id as string,
      amount: row.amount as number,
      currency: row.currency as string,
      merchant: (row.merchant as string | undefined) ?? '',
      categoryId: row.category_id as string | undefined,
      transactionDate: row.transaction_date
        ? new Date(row.transaction_date as string)
        : new Date(),
      source: (row.source as 'email' | 'manual') || 'manual',
      cardType: (row.card_type as string | undefined) ?? '',
      cardLastDigits: (row.card_last_digits as string | undefined) ?? '',
      bank: (row.bank as string | undefined) ?? '',
      email: (row.email as string | undefined) ?? '',
      totalInstallments: row.total_installments as number | undefined,
      paidInstallments: row.paid_installments as number | undefined,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
      deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
    };
  }

  private transactionToDbRow(
    tx: Transaction,
    now: string,
  ): Record<string, unknown> {
    return {
      id: tx.id,
      credit_card_id: tx.creditCardId,
      amount: tx.amount,
      currency: tx.currency,
      merchant: tx.merchant || null,
      category_id: tx.categoryId || null,
      transaction_date: this.toIsoString(tx.transactionDate),
      source: tx.source || 'manual',
      card_type: tx.cardType || null,
      card_last_digits: tx.cardLastDigits || null,
      bank: tx.bank || null,
      email: tx.email || null,
      total_installments: tx.totalInstallments || null,
      paid_installments: tx.paidInstallments || null,
      created_at: this.toIsoString(tx.createdAt) || now,
      updated_at: now,
      deleted_at: null,
    };
  }
}