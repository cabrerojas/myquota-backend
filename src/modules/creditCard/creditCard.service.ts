import { BaseService } from "@/shared/classes/base.service";
import { CreditCard } from "./creditCard.model";
import { CreditCardRepositorySupabase } from "./creditCard.repository.supabase";
import {
  CacheService,
  CacheTTL,
  CacheKeys,
} from "@/shared/services/cache.service";
import { IBaseEntity } from "@/shared/interfaces/base.repository";
import { PaginationParams, QueryResult } from "@/shared/classes/supabase.repository";

export class CreditCardService extends BaseService<CreditCard> {
  protected repository: CreditCardRepositorySupabase;
  private userId?: string;

  constructor(repository: CreditCardRepositorySupabase) {
    super(repository);
    this.repository = repository;
    this.userId = (repository as unknown as { userId?: string }).userId;
  }

  /**
   * Retrieves all credit cards for the user with L1 caching.
   * Cache TTL: 5 minutes (LONG)
   * 
   * When pagination params provided, returns paginated results with cursor metadata.
   * When no pagination provided, returns full list (cached).
   */
  async findAll(_filters?: Partial<CreditCard>, pagination?: PaginationParams): Promise<QueryResult<CreditCard>> {
    // If pagination is requested, bypass cache and query directly
    if (pagination) {
      return this.repository.findAll(undefined, pagination);
    }

    // Original behavior: return all credit cards with caching
    if (!this.userId) {
      // Fallback: query directly if no userId available
      return super.findAll();
    }

    const cacheKey = CacheKeys.creditCards(this.userId);
    const cached = CacheService.get<CreditCard[]>(cacheKey);
    if (cached !== null) {
      return {
        items: cached,
        metadata: { hasMore: false, nextCursor: null },
      };
    }

    const result = await this.repository.findAll();
    CacheService.set(cacheKey, result.items, CacheTTL.LONG);
    return result;
  }

  /**
   * Create a credit card and invalidate the cache.
   */
  async create(data: Omit<CreditCard, keyof IBaseEntity>): Promise<CreditCard> {
    const result = await super.create(data);
    // Invalidate cache after create
    if (this.userId) {
      CacheService.invalidateByPrefix(CacheKeys.userPrefix(this.userId));
    }
    return result;
  }

  /**
   * Update a credit card and invalidate the cache.
   */
  async update(id: string, data: Partial<Omit<CreditCard, keyof IBaseEntity>>): Promise<CreditCard | null> {
    const result = await super.update(id, data);
    // Invalidate cache after update
    if (this.userId) {
      CacheService.invalidateByPrefix(CacheKeys.userPrefix(this.userId));
    }
    return result;
  }

  /**
   * Delete (soft) a credit card and invalidate the cache.
   */
  async softDelete(id: string): Promise<boolean> {
    const result = await super.softDelete(id);
    // Invalidate cache after delete
    if (this.userId) {
      CacheService.invalidateByPrefix(CacheKeys.userPrefix(this.userId));
    }
    return result;
  }

  /**
   * Counts the total number of uncategorized transactions across all
   * credit cards for the current user.
   *
   * L1: memory (TTL MEDIUM)
   * L2: Firestore summary — users/{userId}/summaries/uncategorizedCount (1 read)
   * L3: full compute — 1 read per credit card (N reads)
   */
  async getUncategorizedCount(userId: string): Promise<number> {
    const cacheKey = CacheKeys.uncategorizedCount(userId);
    const cached = CacheService.get<number>(cacheKey);
    if (cached !== null) return cached;

    const ccResult = await this.repository.findAll();
    const creditCards = ccResult.items;
    let count = 0;

    for (const card of creditCards) {
      const transactions = await this.repository.getTransactions(card.id);
      for (const tx of transactions) {
        if (!tx.categoryId) count++;
      }
    }

    CacheService.set(cacheKey, count, CacheTTL.MEDIUM);
    return count;
  }
}
