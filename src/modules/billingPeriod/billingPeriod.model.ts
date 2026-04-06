import { IBaseEntity } from "@/shared/interfaces/base.repository";

export class BillingPeriod implements IBaseEntity {
  id!: string;
  creditCardId!: string;
  month!: string;
  startDate!: Date;
  endDate!: Date;
  dueDate!: Date;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;
}
