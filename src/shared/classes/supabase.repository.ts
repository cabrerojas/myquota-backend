// src/shared/classes/supabase.repository.ts
// Base Supabase repository implementing IBaseRepository<T>
// Replaces FirestoreRepository<T> when USE_SUPABASE=true

import { RepositoryError } from '@/shared/errors/custom.error';
import { IBaseEntity, IBaseRepository } from '@/shared/interfaces/base.repository';
import { getSupabaseAdmin } from '@/config/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pagination parameters for cursor-based pagination in Supabase.
 */
export interface PaginationParams {
  limit?: number;
  startAfter?: string;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Pagination metadata returned with paginated queries.
 */
export interface PaginationMetadata {
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Result of a paginated query.
 */
export interface QueryResult<T> {
  items: T[];
  metadata: PaginationMetadata;
}

/**
 * Converts camelCase string to snake_case.
 * e.g. "creditCardId" → "credit_card_id"
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Base Supabase repository implementing IBaseRepository<T>.
 *
 * All queries append `WHERE deleted_at IS NULL` (soft delete filter).
 * Cursor pagination uses `id > :startAfter` (not offset).
 * Timestamp fields are converted: Date/ISO string on write → Date on read.
 * Snake_case (Postgres) ↔ camelCase (entity) mapping is handled transparently.
 *
 * Subclasses should override `mapRowToEntity` to apply entity-specific
 * field transformations (e.g., currency normalization).
 */
export class SupabaseRepository<T extends IBaseEntity>
  implements IBaseRepository<T>
{
  constructor(protected readonly tableName: string) {}

  /**
   * Returns the Supabase admin client.
   * Throws if not yet initialized (call getSupabaseAdmin() at app startup).
   */
  protected client(): SupabaseClient {
    return getSupabaseAdmin();
  }

  /**
   * Converts entity fields (camelCase) to DB row (snake_case + ISO strings).
   * Removes undefined values (Postgres rejects them).
   */
  protected sanitizeForDb(data: Record<string, unknown>): Record<string, unknown> {
    const row: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;

      switch (key) {
        case 'userId':
          row.user_id = value;
          break;
        case 'creditCardId':
          row.credit_card_id = value;
          break;
        case 'categoryId':
          row.category_id = value;
          break;
        case 'transactionId':
          row.transaction_id = value;
          break;
        case 'billingPeriodId':
          row.billing_period_id = value;
          break;
        case 'cardType':
          row.card_type = value;
          break;
        case 'cardLastDigits':
          row.card_last_digits = value;
          break;
        case 'cardHolderName':
          row.card_holder_name = value;
          break;
        case 'billingPeriodStart':
          row.billing_period_start = value;
          break;
        case 'billingPeriodEnd':
          row.billing_period_end = value;
          break;
        case 'normalizedName':
          row.normalized_name = value;
          break;
        case 'isGlobal':
          row.is_global = value;
          break;
        case 'refreshToken':
          row.refresh_token_encrypted = value;
          break;
        case 'transactionDate':
          row.transaction_date = value instanceof Date ? value.toISOString() : value;
          break;
        case 'paymentDate':
          row.payment_date = value instanceof Date ? value.toISOString() : value;
          break;
        case 'totalInstallments':
          row.total_installments = value;
          break;
        case 'paidInstallments':
          row.paid_installments = value;
          break;
        case 'closingDay':
          row.closing_day = value;
          break;
        case 'dueDay':
          row.due_day = value;
          break;
        case 'nationalAmountUsed':
          row.national_amount_used = value;
          break;
        case 'nationalAmountAvailable':
          row.national_amount_available = value;
          break;
        case 'nationalTotalLimit':
          row.national_total_limit = value;
          break;
        case 'nationalAdvanceAvailable':
          row.national_advance_available = value;
          break;
        case 'internationalAmountUsed':
          row.international_amount_used = value;
          break;
        case 'internationalAmountAvailable':
          row.international_amount_available = value;
          break;
        case 'internationalTotalLimit':
          row.international_total_limit = value;
          break;
        case 'internationalAdvanceAvailable':
          row.international_advance_available = value;
          break;
        case 'createdAt':
          row.created_at = value instanceof Date ? value.toISOString() : value;
          break;
        case 'updatedAt':
          row.updated_at = value instanceof Date ? value.toISOString() : value;
          break;
        case 'deletedAt':
          row.deleted_at = value instanceof Date ? value.toISOString() : value;
          break;
        default:
          row[key] = value;
      }
    }

    return row;
  }

  /**
   * Maps a Postgres row (snake_case) to an entity (camelCase).
   * Subclasses can override this to apply entity-specific transformations.
   * Default implementation handles all standard FK and timestamp fields.
   */
  protected mapRowToEntity(row: Record<string, unknown>): T {
    const entity: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      switch (key) {
        // Primary key
        case 'id':
          entity.id = value;
          break;

        // FK fields
        case 'user_id':
          entity.userId = value;
          break;
        case 'credit_card_id':
          entity.creditCardId = value;
          break;
        case 'category_id':
          entity.categoryId = value;
          break;
        case 'transaction_id':
          entity.transactionId = value;
          break;
        case 'billing_period_id':
          entity.billingPeriodId = value;
          break;

        // Known camelCase variants
        case 'card_type':
          entity.cardType = value;
          break;
        case 'card_last_digits':
          entity.cardLastDigits = value;
          break;
        case 'card_holder_name':
          entity.cardHolderName = value;
          break;
        case 'billing_period_start':
          entity.billingPeriodStart = value;
          break;
        case 'billing_period_end':
          entity.billingPeriodEnd = value;
          break;
        case 'normalized_name':
          entity.normalizedName = value;
          break;
        case 'is_global':
          entity.isGlobal = value;
          break;
        case 'refresh_token_encrypted':
          entity.refreshToken = value;
          break;
        case 'transaction_date':
          entity.transactionDate = value;
          break;
        case 'payment_date':
          entity.paymentDate = value;
          break;
        case 'total_installments':
          entity.totalInstallments = value;
          break;
        case 'paid_installments':
          entity.paidInstallments = value;
          break;
        case 'closing_day':
          entity.closingDay = value;
          break;
        case 'due_day':
          entity.dueDay = value;
          break;
        case 'national_amount_used':
          entity.nationalAmountUsed = value;
          break;
        case 'national_amount_available':
          entity.nationalAmountAvailable = value;
          break;
        case 'national_total_limit':
          entity.nationalTotalLimit = value;
          break;
        case 'national_advance_available':
          entity.nationalAdvanceAvailable = value;
          break;
        case 'international_amount_used':
          entity.internationalAmountUsed = value;
          break;
        case 'international_amount_available':
          entity.internationalAmountAvailable = value;
          break;
        case 'international_total_limit':
          entity.internationalTotalLimit = value;
          break;
        case 'international_advance_available':
          entity.internationalAdvanceAvailable = value;
          break;

        // Timestamp fields
        case 'created_at':
          entity.createdAt = value ? new Date(value as string) : undefined;
          break;
        case 'updated_at':
          entity.updatedAt = value ? new Date(value as string) : undefined;
          break;
        case 'deleted_at':
          entity.deletedAt = value ? new Date(value as string) : null;
          break;
        case 'due_date':
          entity.dueDate = value ? new Date(value as string) : undefined;
          break;
        case 'expiry_date':
          entity.expiryDate = value ? new Date(value as string) : undefined;
          break;

        // Default: copy as-is (camelCase fields from composite types)
        default:
          entity[key] = value;
      }
    }

    return entity as T;
  }

  async create(
    data: Omit<T, keyof IBaseEntity> & Partial<IBaseEntity>,
  ): Promise<T> {
    if (!data) {
      throw new RepositoryError('Data to create entity is required', 400);
    }

    const now = new Date().toISOString();
    const id =
      (data as Record<string, unknown>).id ||
      (crypto as { randomUUID: () => string }).randomUUID();

    const entity: Record<string, unknown> = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    // Convert camelCase to snake_case for DB
    const dbRow = this.sanitizeForDb(entity);
    // Ensure id, created_at, updated_at, deleted_at are set
    dbRow.id = id;
    dbRow.created_at = now;
    dbRow.updated_at = now;
    dbRow.deleted_at = null;

    const { data: result, error } = await this.client()
      .from(this.tableName)
      .insert(dbRow)
      .select()
      .single();

    if (error || !result) {
      throw new RepositoryError(
        `Error creating entity: ${error?.message ?? 'no data returned'}`,
        500,
      );
    }

    return this.mapRowToEntity(result as Record<string, unknown>);
  }

  async findAll(
    filters?: Partial<T>,
    pagination?: PaginationParams,
  ): Promise<QueryResult<T>> {
    let query = this.client()
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .is('deleted_at', null);

    // Apply filters (equality only)
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          const columnName = camelToSnake(key);
          query = query.eq(columnName, value);
        }
      }
    }

    // Apply ordering
    const orderByField = camelToSnake(pagination?.orderBy || 'created_at');
    const orderDirection = pagination?.orderDirection || 'desc';
    query = query.order(orderByField, { ascending: orderDirection === 'asc' });

    // Apply limit (default 50)
    const limit = pagination?.limit || 50;

    // Fetch one extra to determine hasMore
    query = query.limit(limit + 1);

    // Apply cursor (id-based, not offset)
    if (pagination?.startAfter) {
      query = query.gt('id', pagination.startAfter);
    }

    const { data, error } = await query;

    if (error) {
      throw new RepositoryError(`Error finding entities: ${error.message}`, 500);
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

  async findById(id: string): Promise<T | null> {
    if (!id) {
      throw new RepositoryError('ID is required', 400);
    }

    const { data, error } = await this.client()
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error?.code === 'PGRST116') {
      // PGRST116: "The result contains 0 rows" — treated as not found
      return null;
    }
    if (error) {
      throw new RepositoryError(`Error finding entity: ${error.message}`, 500);
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  async findOne(filters: Partial<T>): Promise<T | null> {
    let query = this.client()
      .from(this.tableName)
      .select('*')
      .is('deleted_at', null);

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        const columnName = camelToSnake(key);
        query = query.eq(columnName, value);
      }
    }

    const { data, error } = await query.limit(1).single();

    if (error?.code === 'PGRST116') {
      return null;
    }
    if (error) {
      throw new RepositoryError(`Error finding entity: ${error.message}`, 500);
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  async update(
    id: string,
    data: Partial<Omit<T, keyof IBaseEntity>>,
  ): Promise<T | null> {
    if (!id || !data) {
      throw new RepositoryError('ID and data to update are required', 400);
    }

    // Check entity exists
    const existing = await this.findById(id);
    if (!existing) {
      throw new RepositoryError(`Entity with ID ${id} not found`, 404);
    }

    const now = new Date().toISOString();
    const updates = this.sanitizeForDb({
      ...data,
      updatedAt: now,
    } as Record<string, unknown>);

    // Remove fields that should not be updated directly
    delete updates.id;
    delete updates.created_at;
    delete updates.deleted_at;

    const { data: result, error } = await this.client()
      .from(this.tableName)
      .update(updates)
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      throw new RepositoryError(`Error updating entity: ${error.message}`, 500);
    }

    return this.mapRowToEntity(result as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    if (!id) {
      throw new RepositoryError('ID is required', 400);
    }

    const { error } = await this.client()
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) {
      throw new RepositoryError(`Error deleting entity: ${error.message}`, 500);
    }

    return true;
  }

  async softDelete(id: string): Promise<boolean> {
    if (!id) {
      throw new RepositoryError('ID is required', 400);
    }

    const { error } = await this.client()
      .from(this.tableName)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      throw new RepositoryError(
        `Error soft deleting entity: ${error.message}`,
        500,
      );
    }

    return true;
  }
}