import { BaseService } from "@/shared/classes/base.service";
import { CreditCard } from "./creditCard.model";
import { CreditCardRepositorySupabase } from "./creditCard.repository.supabase";
import { BillingPeriodRepositorySupabase } from "@/modules/billingPeriod/billingPeriod.repository.supabase";
import {
  CacheService,
  CacheTTL,
  CacheKeys,
} from "@/shared/services/cache.service";
import { IBaseEntity } from "@/shared/interfaces/base.repository";
import { PaginationParams, QueryResult } from "@/shared/classes/supabase.repository";
import { toDate } from "date-fns-tz";

const CHILE_TZ = "America/Santiago";

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function calculateBillingDates(
  closingDay: number,
  dueDay: number,
): { billingPeriodStart: string; billingPeriodEnd: string; dueDate: string } {
  const now = new Date();
  const chileNow = toDate(now, { timeZone: CHILE_TZ });
  const year = chileNow.getFullYear();
  const month = chileNow.getMonth();

  const startDay = Math.min(closingDay, getDaysInMonth(year, month));
  const billingPeriodStart = new Date(year, month, startDay);

  const nextMonth = month + 1;
  const nextMonthYear = nextMonth > 11 ? year + 1 : year;
  const nextMonthIndex = nextMonth % 12;
  const endDay = Math.min(closingDay - 1, getDaysInMonth(nextMonthYear, nextMonthIndex));
  const billingPeriodEnd = endDay < 1
    ? new Date(nextMonthYear, nextMonthIndex, 0)
    : new Date(nextMonthYear, nextMonthIndex, endDay);

  const dueMonth = month + 1;
  const dueMonthYear = dueMonth > 11 ? year + 1 : year;
  const dueMonthIndex = dueMonth % 12;
  const dueDayClamped = Math.min(dueDay, getDaysInMonth(dueMonthYear, dueMonthIndex));
  const dueDate = new Date(dueMonthYear, dueMonthIndex, dueDayClamped);

  return {
    billingPeriodStart: billingPeriodStart.toISOString(),
    billingPeriodEnd: billingPeriodEnd.toISOString(),
    dueDate: dueDate.toISOString(),
  };
}

function formatMonthLabel(date: Date): string {
  const chileDate = toDate(date, { timeZone: CHILE_TZ });
  const y = chileDate.getFullYear();
  const m = String(chileDate.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

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
   * If closingDay/dueDay are provided without date fields, auto-calculates
   * billing dates. If this is the user's first card, auto-creates a billing period.
   */
  async create(data: Omit<CreditCard, keyof IBaseEntity>): Promise<CreditCard> {
    // Auto-calculate billing dates from closingDay/dueDay if dates not provided
    if (
      data.closingDay !== undefined &&
      data.dueDay !== undefined &&
      !data.billingPeriodStart &&
      !data.billingPeriodEnd &&
      !data.dueDate
    ) {
      const dates = calculateBillingDates(data.closingDay, data.dueDay);
      data = {
        ...data,
        billingPeriodStart: dates.billingPeriodStart,
        billingPeriodEnd: dates.billingPeriodEnd,
        dueDate: dates.dueDate,
      } as unknown as Omit<CreditCard, keyof IBaseEntity>;
    }

    const result = await super.create(data);

    // Invalidate cache after create
    if (this.userId) {
      CacheService.invalidateByPrefix(CacheKeys.userPrefix(this.userId));

      // If this is the user's first card, auto-create a billing period
      try {
        const allCards = await this.repository.findAll();
        if (allCards.items.length === 1) {
          const bpRepo = new BillingPeriodRepositorySupabase(result.id);

          const monthLabel = formatMonthLabel(new Date(result.billingPeriodStart));

          await bpRepo.create({
            creditCardId: result.id,
            month: monthLabel,
            startDate: new Date(result.billingPeriodStart),
            endDate: new Date(result.billingPeriodEnd),
            dueDate: new Date(result.dueDate),
          });
        }
      } catch (error) {
        console.error("Error creating initial billing period:", error);
      }
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
