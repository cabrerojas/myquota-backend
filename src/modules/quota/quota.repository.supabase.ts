// src/modules/quota/quota.repository.ts
// Supabase implementation of the Quota repository.
// In Postgres, quotas are a TOP-LEVEL table (not a subcollection).
// This file REPLACES the previous pattern where quotas were accessed
// as a Firestore subcollection via TransactionRepository.getQuotas().

import { SupabaseRepository } from '@/shared/classes/supabase.repository';
import { Quota } from './quota.model';
import { RepositoryError } from '@/shared/errors/custom.error';

export class QuotaRepositorySupabase extends SupabaseRepository<Quota> {
  constructor() {
    super('quotas');
  }

  // ===============================================
  // COLLECTION GROUP EQUIVALENCE
  // Replaces Firestore collectionGroup("quotas") queries
  // ===============================================

  /**
   * getPendingQuotasByUser — replaces:
   * collectionGroup("quotas")
   *   .where("status", "==", "pending")
   *   .where("deletedAt", "==", null)
   *
   * SQL equivalence via JOIN:
   * SELECT q.* FROM quotas q
   * JOIN transactions t ON q.transaction_id = t.id
   * JOIN credit_cards cc ON t.credit_card_id = cc.id
   * WHERE q.status = 'pending'
   *   AND q.deleted_at IS NULL
   *   AND cc.user_id = :userId
   */
  async getPendingQuotasByUser(userId: string): Promise<Quota[]> {
    const { data, error } = await this.client()
      .from('quotas')
      .select(
        `*, transaction:transactions(id, credit_card_id, credit_card_id:credit_cards(user_id, id))`,
      )
      .eq('status', 'pending')
      .is('deleted_at', null);

    if (error) {
      throw new RepositoryError(
        `Error getting pending quotas by user: ${error.message}`,
        500,
      );
    }

    // Filter by user_id via the JOIN relationship
    // Supabase doesn't support nested WHERE in RPC-style join filters,
    // so we filter in application code using the embedded relation
    const rows = data as Record<string, unknown>[];
    const filtered = rows.filter((row) => {
      const tx = row.transaction as Record<string, unknown> | undefined;
      if (!tx) return false;
      const cc = tx.credit_card_id as Record<string, unknown> | undefined;
      if (!cc) return false;
      return cc.user_id === userId;
    });

    return filtered.map((row) => this.mapRowToEntity(row));
  }

  /**
   * getPendingQuotasByCreditCard — returns all pending quotas for a credit card.
   * Used by debt forecast and billing period quota sum computations.
   */
  async getPendingQuotasByCreditCard(creditCardId: string): Promise<Quota[]> {
    const { data, error } = await this.client()
      .from('quotas')
      .select('*')
      .eq('credit_card_id', creditCardId)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .order('due_date', { ascending: true });

    if (error) {
      throw new RepositoryError(
        `Error getting pending quotas by credit card: ${error.message}`,
        500,
      );
    }

    return (data as Record<string, unknown>[]).map((row) =>
      this.mapRowToEntity(row),
    );
  }

  /**
   * getQuotasByTransaction — returns all quotas for a specific transaction.
   */
  async getQuotasByTransaction(transactionId: string): Promise<Quota[]> {
    const { data, error } = await this.client()
      .from('quotas')
      .select('*')
      .eq('transaction_id', transactionId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true });

    if (error) {
      throw new RepositoryError(
        `Error getting quotas by transaction: ${error.message}`,
        500,
      );
    }

    return (data as Record<string, unknown>[]).map((row) =>
      this.mapRowToEntity(row),
    );
  }

  /**
   * markAsPaid — marks a quota as paid with a payment date.
   */
  async markAsPaid(id: string, paymentDate: Date): Promise<Quota | null> {
    const { data, error } = await this.client()
      .from('quotas')
      .update({
        status: 'paid',
        payment_date: paymentDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(
        `Error marking quota as paid: ${error.message}`,
        500,
      );
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * getOverdueQuotas — returns quotas past their due date that are still pending.
   */
  async getOverdueQuotas(creditCardId: string): Promise<Quota[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.client()
      .from('quotas')
      .select('*')
      .eq('credit_card_id', creditCardId)
      .eq('status', 'pending')
      .lt('due_date', today)
      .is('deleted_at', null);

    if (error) {
      throw new RepositoryError(
        `Error getting overdue quotas: ${error.message}`,
        500,
      );
    }

    return (data as Record<string, unknown>[]).map((row) =>
      this.mapRowToEntity(row),
    );
  }

  // ===============================================
  // OVERRIDES for top-level table semantics
  // ===============================================

  /**
   * create — inserts a quota with required FKs.
   */
  async create(
    data: Omit<Quota, keyof import('@/shared/interfaces/base.repository').IBaseEntity> &
      Partial<import('@/shared/interfaces/base.repository').IBaseEntity>,
  ): Promise<Quota> {
    if (!(data as Record<string, unknown>).transactionId) {
      throw new RepositoryError('transactionId is required to create a quota', 400);
    }
    if (!(data as Record<string, unknown>).creditCardId) {
      throw new RepositoryError('creditCardId is required to create a quota', 400);
    }

    return super.create(data);
  }

  /**
   * findById — returns a quota by ID.
   */
  async findById(id: string): Promise<Quota | null> {
    const { data, error } = await this.client()
      .from('quotas')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(`Error finding quota: ${error.message}`, 500);
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * softDelete — soft-deletes a quota.
   */
  async softDelete(id: string): Promise<boolean> {
    if (!id) {
      throw new RepositoryError('ID is required', 400);
    }

    const { error } = await this.client()
      .from('quotas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      throw new RepositoryError(
        `Error soft deleting quota: ${error.message}`,
        500,
      );
    }

    return true;
  }
}