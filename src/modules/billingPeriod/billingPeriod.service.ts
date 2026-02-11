import { BaseService } from "@/shared/classes/base.service";
import { BillingPeriodRepository } from "./billingPeriod.repository";
import { BillingPeriod } from "./billingPeriod.model";
import { IBaseEntity } from "@/shared/interfaces/base.repository";
import { toChileStartOfDay, toChileEndOfDay } from "@/shared/utils/date.utils";

export class BillingPeriodService extends BaseService<BillingPeriod> {
  protected repository: BillingPeriodRepository;

  constructor(repository: BillingPeriodRepository) {
    super(repository);
    this.repository = repository;
  }

  /**
   * Normaliza las fechas del período:
   * - startDate → 00:00:00 hora Chile (guardado en UTC)
   * - endDate → 23:59:59 hora Chile (guardado en UTC)
   */
  private normalizeDates<
    D extends { startDate?: Date | string; endDate?: Date | string },
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
    return normalized;
  }

  async create(
    data: Omit<BillingPeriod, keyof IBaseEntity>,
  ): Promise<BillingPeriod> {
    return super.create(this.normalizeDates(data));
  }

  async update(
    id: string,
    data: Partial<Omit<BillingPeriod, keyof IBaseEntity>>,
  ): Promise<BillingPeriod | null> {
    return super.update(id, this.normalizeDates(data));
  }
}
