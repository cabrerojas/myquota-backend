import { BaseService } from "@/shared/classes/base.service";
import { BillingPeriodRepository } from "./billingPeriod.repository";
import { BillingPeriod } from "./billingPeriod.model";
import { IBaseEntity } from "@/shared/interfaces/base.repository";

export class BillingPeriodService extends BaseService<BillingPeriod> {
  protected repository: BillingPeriodRepository;

  constructor(repository: BillingPeriodRepository) {
    super(repository);
    this.repository = repository;
  }

  /**
   * Normaliza endDate para que siempre termine a las 23:59:59.
   */
  private normalizeEndDate<D extends { endDate?: Date | string }>(data: D): D {
    if (data.endDate) {
      const date = new Date(data.endDate);
      date.setHours(23, 59, 59, 999);
      return { ...data, endDate: date };
    }
    return data;
  }

  async create(
    data: Omit<BillingPeriod, keyof IBaseEntity>,
  ): Promise<BillingPeriod> {
    return super.create(this.normalizeEndDate(data));
  }

  async update(
    id: string,
    data: Partial<Omit<BillingPeriod, keyof IBaseEntity>>,
  ): Promise<BillingPeriod | null> {
    return super.update(id, this.normalizeEndDate(data));
  }
}
