import { IBaseEntity } from "@/shared/interfaces/base.repository";

export class Quota implements IBaseEntity {
  id!: string;
  transactionId!: string; // ID de la transacción asociada
  amount!: number; // Monto de la cuota
  dueDate!: Date; // Fecha de vencimiento de la cuota
  status!: "pending" | "paid"; // Estado de la cuota
  currency!: string; // Moneda de la cuota
  paymentDate?: Date | null; // Fecha de pago de la cuota (opcional)
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt!: Date | null;
}
