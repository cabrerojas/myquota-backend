// src/modules/billingPeriod/billingPeriod.repository.supabase.ts
// Supabase implementation of the BillingPeriod repository.

import {
  SupabaseRepository,
  PaginationParams,
  QueryResult,
} from '@/shared/classes/supabase.repository';
import { BillingPeriod } from './billingPeriod.model';
import { RepositoryError } from '@/shared/errors/custom.error';

export class BillingPeriodRepositorySupabase extends SupabaseRepository<BillingPeriod> {
  constructor(
    private readonly creditCardId: string,
  ) {
    super('billing_periods');
  }

  /**
   * findAll — returns billing periods ordered by startDate descending.
   * Filters by credit_card_id.
   */
  async findAll(
    filters?: Partial<BillingPeriod>,
    pagination?: PaginationParams,
  ): Promise<QueryResult<BillingPeriod>> {
    const baseFilters = {
      creditCardId: this.creditCardId,
      ...filters,
    } as Partial<BillingPeriod>;

    const params: PaginationParams = {
      ...pagination,
      orderBy: pagination?.orderBy || 'startDate',
      orderDirection: pagination?.orderDirection || 'desc',
      limit: pagination?.limit || 20,
    };

    return super.findAll(baseFilters, params);
  }

  /**
   * findById — returns a billing period by ID, ensuring it belongs to
   * this credit card (and thus this user via FK chain).
   */
  async findById(id: string): Promise<BillingPeriod | null> {
    const { data, error } = await this.client()
      .from('billing_periods')
      .select('*')
      .eq('id', id)
      .eq('credit_card_id', this.creditCardId)
      .is('deleted_at', null)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(
        `Error finding billing period: ${error.message}`,
        500,
      );
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * create — inserts a new billing period for this credit card.
   */
  async create(
    data: Omit<BillingPeriod, keyof import('@/shared/interfaces/base.repository').IBaseEntity> &
      Partial<import('@/shared/interfaces/base.repository').IBaseEntity>,
  ): Promise<BillingPeriod> {
    const bpData = {
      ...data,
      creditCardId: this.creditCardId,
    } as Omit<BillingPeriod, keyof import('@/shared/interfaces/base.repository').IBaseEntity> &
      Partial<import('@/shared/interfaces/base.repository').IBaseEntity>;

    return super.create(bpData);
  }

  /**
   * findByMonth — returns the billing period for a specific month.
   */
  async findByMonth(month: string): Promise<BillingPeriod | null> {
    const { data, error } = await this.client()
      .from('billing_periods')
      .select('*')
      .eq('credit_card_id', this.creditCardId)
      .eq('month', month)
      .is('deleted_at', null)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(
        `Error finding billing period by month: ${error.message}`,
        500,
      );
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * update — updates a billing period if it belongs to this credit card.
   */
  async update(
    id: string,
    data: Partial<Omit<BillingPeriod, keyof import('@/shared/interfaces/base.repository').IBaseEntity>>,
  ): Promise<BillingPeriod | null> {
    if (!id || !data) {
      throw new RepositoryError('ID and data to update are required', 400);
    }

    const existing = await this.findById(id);
    if (!existing) {
      throw new RepositoryError(`Billing period with ID ${id} not found`, 404);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (key === 'creditCardId') updates.credit_card_id = value;
      else if (key === 'userId') updates.user_id = value;
      else if (key === 'createdAt') updates.created_at = value instanceof Date ? value.toISOString() : value;
      else if (key === 'updatedAt') updates.updated_at = now;
      else if (key === 'deletedAt') updates.deleted_at = value instanceof Date ? value.toISOString() : value;
      else updates[key] = value;
    }

    delete updates.id;
    delete updates.created_at;
    delete updates.deleted_at;
    delete updates.credit_card_id;

    const { data: result, error } = await this.client()
      .from('billing_periods')
      .update(updates)
      .eq('id', id)
      .eq('credit_card_id', this.creditCardId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      throw new RepositoryError(
        `Error updating billing period: ${error.message}`,
        500,
      );
    }

    return this.mapRowToEntity(result as Record<string, unknown>);
  }

  /**
   * softDelete — soft-deletes a billing period.
   */
  async softDelete(id: string): Promise<boolean> {
    if (!id) {
      throw new RepositoryError('ID is required', 400);
    }

    const { error } = await this.client()
      .from('billing_periods')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('credit_card_id', this.creditCardId)
      .is('deleted_at', null);

    if (error) {
      throw new RepositoryError(
        `Error soft deleting billing period: ${error.message}`,
        500,
      );
    }

    return true;
  }
}