import { BaseService } from "@/shared/classes/base.service";
import { IBaseEntity } from "@/shared/interfaces/base.repository";
import { toChileStartOfDay, toChileEndOfDay } from "@/shared/utils/date.utils";
import {
  CacheService,
  CacheTTL,
  CacheKeys,
} from "@/shared/services/cache.service";
import { PaginationParams, QueryResult } from "@/shared/classes/supabase.repository";
import { BillingPeriodRepositorySupabase } from "./billingPeriod.repository.supabase";
import { BillingPeriodSettlementOutcome } from "./billingPeriod.repository.supabase";
import { StatsService } from "@/modules/stats/stats.service";
import { BillingPeriod } from "./billingPeriod.model";

export class BillingPeriodService extends BaseService<BillingPeriod> {
  protected repository: BillingPeriodRepositorySupabase;
  private creditCardId: string;
  private userId?: string;

  constructor(
    repository: BillingPeriodRepositorySupabase,
    creditCardId?: string,
    userId?: string,
  ) {
    super(repository);
    this.repository = repository;
    this.creditCardId = creditCardId || "";
    this.userId = userId;
  }

  /**
   * Retrieves all billing periods with L1 caching.
   * Cache TTL: 5 minutes (LONG)
   * 
   * When pagination params provided, returns paginated results.
   */
  async findAll(_filters?: Partial<BillingPeriod>, pagination?: PaginationParams): Promise<QueryResult<BillingPeriod>> {
    // If pagination requested, bypass cache
    if (pagination) {
      return this.repository.findAll(undefined, pagination);
    }

    if (!this.creditCardId) {
      return super.findAll();
    }

    const cacheKey = CacheKeys.billingPeriods(this.userId!, this.creditCardId);
    const cached = CacheService.get<BillingPeriod[]>(cacheKey);
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
   * Create a billing period and invalidate the cache.
   */
  async create(
    data: Omit<BillingPeriod, keyof IBaseEntity>,
  ): Promise<BillingPeriod> {
    const result = await super.create(this.normalizeBillingPeriod(data));
    // Invalidate cache after create
    if (this.userId && this.creditCardId) {
      CacheService.invalidate(
        CacheKeys.billingPeriods(this.userId, this.creditCardId),
      );
    }
    return result;
  }

  /**
   * Update a billing period and invalidate the cache.
   */
  async update(
    id: string,
    data: Partial<Omit<BillingPeriod, keyof IBaseEntity>>,
  ): Promise<BillingPeriod | null> {
    const result = await super.update(id, this.normalizeBillingPeriod(data));
    // Invalidate cache after update
    if (this.userId && this.creditCardId) {
      CacheService.invalidate(
        CacheKeys.billingPeriods(this.userId, this.creditCardId),
      );
    }
    return result;
  }

  /**
   * Delete (soft) a billing period and invalidate the cache.
   */
  async softDelete(id: string): Promise<boolean> {
    const result = await super.softDelete(id);
    // Invalidate cache after delete
    if (this.userId && this.creditCardId) {
      CacheService.invalidate(
        CacheKeys.billingPeriods(this.userId, this.creditCardId),
      );
    }
    return result;
  }

  /**
   * Normaliza las fechas del período:
   * - startDate → 00:00:00 hora Chile (guardado en UTC)
   * - endDate → 23:59:59 hora Chile (guardado en UTC)
   */
  private normalizeDates<
    D extends {
      startDate?: Date | string;
      endDate?: Date | string;
      dueDate?: Date | string;
    },
  >(data: D): D {
    const normalized = { ...data };
    if (normalized.startDate) {
      (normalized as Record<string, unknown>).startDate = toChileStartOfDay(
        normalized.startDate,
      );
    }
    if (normalized.endDate) {
      (normalized as Record<string, unknown>).endDate = toChileEndOfDay(
        normalized.endDate,
      );
    }
    if (normalized.dueDate) {
      (normalized as Record<string, unknown>).dueDate = toChileEndOfDay(
        normalized.dueDate,
      );
    }
    return normalized;
  }

  private normalizeBillingPeriod<
    D extends {
      month?: string;
      startDate?: Date | string;
      endDate?: Date | string;
      dueDate?: Date | string;
    },
  >(data: D): D {
    const normalized = this.normalizeDates(data);

    if (normalized.month !== undefined) {
      (normalized as Record<string, unknown>).month = this.normalizeMonth(
        normalized.month,
      );
    }

    return normalized;
  }

  private normalizeMonth(month: string): string {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error("Month must use the YYYY-MM format");
    }

    return month;
  }

  async settleBillingPeriod(
    billingPeriodId: string,
  ): Promise<BillingPeriodSettlementOutcome> {
    if (!this.userId || !this.creditCardId) {
      throw new Error("User and credit card are required to settle a billing period");
    }

    const outcome = await this.repository.settleBillingPeriod(
      billingPeriodId,
      this.userId,
    );
    StatsService.triggerRecompute(this.userId, this.creditCardId);
    return outcome;
  }
}
