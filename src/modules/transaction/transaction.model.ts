import { IBaseEntity } from "@/shared/interfaces/base.repository";

export interface TransactionRefund {
  id: string;
  amount: number;
  currency: string;
  transactionDate: Date;
  createdAt: Date;
  refundReason?: string;
}

export interface TransactionWithRefundSummary extends Transaction {
  refundStatus?: "none" | "partial" | "full";
  refundedAmount?: number;
  refundableAmount?: number;
  canRefund?: boolean;
  refunds?: TransactionRefund[];
}

export class Transaction implements IBaseEntity {
  id!: string;
  amount!: number;
  currency!: string;
  cardType!: string;
  cardLastDigits!: string;
  merchant!: string;
  categoryId?: string;
  transactionDate!: Date;
  bank!: string;
  email!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt!: Date | null;
  creditCardId!: string;
  parentTransactionId?: string | null;
  refundReason?: string;
  // Campos para transacciones manuales
  source?: "email" | "manual" | "refund";
  totalInstallments?: number;
  paidInstallments?: number;
  messageId?: string;
}
