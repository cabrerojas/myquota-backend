import { IBaseEntity } from "@/shared/interfaces/base.repository";

export class BillingPeriod implements IBaseEntity {
  id!: string;
  creditCardId!: string;
  startDate!: Date;
  endDate!: Date;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;
}
