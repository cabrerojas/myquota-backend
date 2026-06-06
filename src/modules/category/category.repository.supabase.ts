// src/modules/category/category.repository.supabase.ts
// Supabase implementation of the Category repository.
// Supports both global (is_global=true) and personal (user_id=userId) categories.

import { SupabaseRepository } from '@/shared/classes/supabase.repository';
import { Category } from './category.model';
import { RepositoryError } from '@/shared/errors/custom.error';
import { QueryResult, PaginationParams } from '@/shared/classes/supabase.repository';

export class CategoryRepositorySupabase extends SupabaseRepository<Category> {
  /**
   * When userId is provided: returns personal + global categories.
   * When userId is undefined: returns only global categories.
   */
  constructor(private readonly userId?: string) {
    super('categories');
  }

  /**
   * findAll — returns global categories plus personal categories for this user.
   * This replaces the Firestore pattern of two separate collection paths
   * (global: no path prefix; personal: users/:userId/categories).
   * Returns all items (no pagination needed for categories).
   */
  async findAll(
    _filters?: Partial<Category>,
    _pagination?: PaginationParams,
  ): Promise<QueryResult<Category>> {
    let query = this.client()
      .from('categories')
      .select('*')
      .is('deleted_at', null);

    if (this.userId) {
      // Return global categories OR user's personal categories
      query = query.or(`is_global.eq.true,user_id.eq.${this.userId}`);
    } else {
      // Global-only query (no userId provided)
      query = query.eq('is_global', true);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      throw new RepositoryError(
        `Error finding categories: ${error.message}`,
        500,
      );
    }

    const items = (data as Record<string, unknown>[]).map((row) =>
      this.mapRowToEntity(row),
    );

    return { items, metadata: { hasMore: false, nextCursor: null } };
  }

  /**
   * findGlobal — returns only global categories.
   */
  async findGlobal(): Promise<Category[]> {
    const { data, error } = await this.client()
      .from('categories')
      .select('*')
      .eq('is_global', true)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (error) {
      throw new RepositoryError(
        `Error finding global categories: ${error.message}`,
        500,
      );
    }

    return (data as Record<string, unknown>[]).map((row) =>
      this.mapRowToEntity(row),
    );
  }

  /**
   * findPersonal — returns only this user's personal categories.
   */
  async findPersonal(): Promise<Category[]> {
    if (!this.userId) {
      throw new RepositoryError(
        'userId is required to find personal categories',
        400,
      );
    }

    const { data, error } = await this.client()
      .from('categories')
      .select('*')
      .eq('user_id', this.userId)
      .eq('is_global', false)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (error) {
      throw new RepositoryError(
        `Error finding personal categories: ${error.message}`,
        500,
      );
    }

    return (data as Record<string, unknown>[]).map((row) =>
      this.mapRowToEntity(row),
    );
  }

  /**
   * findByNormalizedName — finds a category by normalized name for deduplication.
   * Searches global categories + user's personal categories.
   */
  async findByNormalizedName(
    normalizedName: string,
  ): Promise<Category | null> {
    let query = this.client()
      .from('categories')
      .select('*')
      .eq('normalized_name', normalizedName)
      .is('deleted_at', null);

    if (this.userId) {
      query = query.or(`is_global.eq.true,user_id.eq.${this.userId}`);
    } else {
      query = query.eq('is_global', true);
    }

    const { data, error } = await query.limit(1).single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(
        `Error finding category by normalized name: ${error.message}`,
        500,
      );
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * create — creates a global or personal category.
   */
  async create(
    data: Omit<Category, keyof import('@/shared/interfaces/base.repository').IBaseEntity> &
      Partial<import('@/shared/interfaces/base.repository').IBaseEntity>,
  ): Promise<Category> {
    const categoryData = {
      ...data,
      userId: data.userId ?? this.userId,
    } as Omit<Category, keyof import('@/shared/interfaces/base.repository').IBaseEntity> &
      Partial<import('@/shared/interfaces/base.repository').IBaseEntity>;

    return super.create(categoryData);
  }

  /**
   * findById — returns a category by ID (global or personal).
   */
  async findById(id: string): Promise<Category | null> {
    const { data, error } = await this.client()
      .from('categories')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(
        `Error finding category: ${error.message}`,
        500,
      );
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * update — updates a category (global categories are readable by all,
   * but only the owner can update personal categories).
   */
  async update(
    id: string,
    data: Partial<Omit<Category, keyof import('@/shared/interfaces/base.repository').IBaseEntity>>,
  ): Promise<Category | null> {
    if (!id || !data) {
      throw new RepositoryError('ID and data to update are required', 400);
    }

    const existing = await this.findById(id);
    if (!existing) {
      throw new RepositoryError(`Category with ID ${id} not found`, 404);
    }

    // Personal categories can only be updated by their owner
    if (!existing.isGlobal && existing.userId !== this.userId) {
      throw new RepositoryError(
        'Not authorized to update this personal category',
        403,
      );
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    const dataRecord = data as Record<string, unknown>;
    for (const [key, value] of Object.entries(dataRecord)) {
      if (value === undefined) continue;
      if (key === 'userId') updates.user_id = value;
      else if (key === 'isGlobal') updates.is_global = value;
      else if (key === 'normalizedName') updates.normalized_name = value;
      else if (key === 'createdAt') updates.created_at = value instanceof Date ? value.toISOString() : value;
      else if (key === 'updatedAt') updates.updated_at = now;
      else if (key === 'deletedAt') updates.deleted_at = value instanceof Date ? value.toISOString() : value;
      else updates[key] = value;
    }

    delete updates.id;
    delete updates.created_at;
    delete updates.deleted_at;

    const { data: result, error } = await this.client()
      .from('categories')
      .update(updates)
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      throw new RepositoryError(
        `Error updating category: ${error.message}`,
        500,
      );
    }

    return this.mapRowToEntity(result as Record<string, unknown>);
  }

  /**
   * softDelete — soft-deletes a category.
   * Personal categories can only be deleted by their owner.
   */
  async softDelete(id: string): Promise<boolean> {
    if (!id) {
      throw new RepositoryError('ID is required', 400);
    }

    const existing = await this.findById(id);
    if (!existing) return false;

    if (!existing.isGlobal && existing.userId !== this.userId) {
      throw new RepositoryError(
        'Not authorized to delete this personal category',
        403,
      );
    }

    const { error } = await this.client()
      .from('categories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      throw new RepositoryError(
        `Error soft deleting category: ${error.message}`,
        500,
      );
    }

    return true;
  }
}