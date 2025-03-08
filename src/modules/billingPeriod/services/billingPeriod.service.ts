
import { BaseService } from "@/shared/classes/base.service";
import { BillingPeriodRepository } from "../repositories/billingPeriod.repository";
import { BillingPeriod } from "../models/billingPeriod.model";

export class BillingPeriodService extends BaseService<BillingPeriod> {
  protected repository: BillingPeriodRepository;

  constructor(repository: BillingPeriodRepository) {
    super(repository);
    // Guardar la referencia al repository tipado
    this.repository = repository;
  }
}
