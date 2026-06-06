import { BaseService } from "@/shared/classes/base.service";
import { IBaseEntity } from "@/shared/interfaces/base.repository";
import { toChileStartOfDay, toChileEndOfDay } from "@/shared/utils/date.utils";
import {
  CacheService,
  CacheTTL,
  CacheKeys,
} from "@/shared/services/cache.service";
import { PaginationParams, QueryResult } from "@/shared/classes/supabase.repository";
import { TransactionRepositorySupabase } from "@/modules/transaction/transaction.repository.supabase";
import { BillingPeriodRepositorySupabase } from "./billingPeriod.repository.supabase";
import { QuotaRepositorySupabase } from "@/modules/quota/quota.repository.supabase";
import { BillingPeriod } from "./billingPeriod.model";

export class BillingPeriodService extends BaseService<BillingPeriod> {
  protected repository: BillingPeriodRepositorySupabase;
  private transactionRepository: TransactionRepositorySupabase | null = null;
  private creditCardId: string;
  private userId?: string;

  constructor(
    repository: BillingPeriodRepositorySupabase,
    transactionRepository?: TransactionRepositorySupabase,
    creditCardId?: string,
    userId?: string,
  ) {
    super(repository);
    this.repository = repository;
    this.creditCardId = creditCardId || "";
    this.userId = userId;
    if (transactionRepository) {
      this.transactionRepository = transactionRepository;
    }
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
    const result = await super.create(this.normalizeDates(data));
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
    const result = await super.update(id, this.normalizeDates(data));
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

  /**
   * Mark as paid all pending quotas whose dueDate falls within the billing period range.
   */
  async payBillingPeriod(
    billingPeriodId: string,
  ): Promise<{ paidCount: number; totalAmount: number }> {
    if (!this.transactionRepository) {
      throw new Error("TransactionRepository no disponible");
    }

    const period = await this.findById(billingPeriodId);
    if (!period) {
      throw new Error("Período de facturación no encontrado");
    }

    const startDate = new Date(period.startDate).getTime();
    const endDate = new Date(period.endDate).getTime();

    const txResult = await this.transactionRepository.findAll();
    const transactions = txResult.items;

    let paidCount = 0;
    let totalAmount = 0;
    const paymentDate = new Date().toISOString();

    const quotaRepo = new QuotaRepositorySupabase();

    for (const tx of transactions) {
      const quotas = await this.transactionRepository.getQuotas(tx.id);

      const pendingInRange = quotas.filter((q: { status: string; dueDate: Date | string }) => {
        if (q.status !== "pending") return false;
        const dueTime = new Date(q.dueDate).getTime();
        return dueTime >= startDate && dueTime <= endDate;
      });

      for (const quota of pendingInRange) {
        await quotaRepo.markAsPaid(quota.id, new Date(paymentDate));
        paidCount++;
        totalAmount += quota.amount;
      }
    }

    return { paidCount, totalAmount };
  }
}
