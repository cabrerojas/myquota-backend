import { IBaseEntity } from "@/shared/interfaces/base.repository";

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
  // Campos para transacciones manuales
  source?: "email" | "manual";
  totalInstallments?: number;
  paidInstallments?: number;
  // Campos de categorización
  /** Normalized merchant key for grouping/matching (e.g. "mercadolibre") */
  merchantNormalized?: string;
  /** How the category was assigned */
  categorizationMethod?: "auto" | "rule" | "manual";
  /** Which rule was applied (if method === "rule") */
  categoryRuleId?: string;
}

/**
 * DTO for the future "split transaction" feature.
 * A single transaction is split into multiple sub-entries with distinct categories.
 * NOT implemented yet — kept here for design reference.
 */
export interface SplitTransactionDto {
  transactionId: string;
  splits: Array<{
    amount: number;
    categoryId: string;
    description?: string;
  }>;
}
