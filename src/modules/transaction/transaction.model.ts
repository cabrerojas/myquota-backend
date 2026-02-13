import { IBaseEntity } from "@/shared/interfaces/base.repository";

export class Transaction implements IBaseEntity {
  id!: string;
  amount!: number;
  currency!: string;
  cardType!: string;
  cardLastDigits!: string;
  merchant!: string;
  transactionDate!: Date;
  bank!: string;
  email!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt!: Date | null;
  creditCardId!: string;
  // Campos para transacciones manuales
  source?: "email" | "manual";
  totalInstallments?: number;
  paidInstallments?: number;
}
