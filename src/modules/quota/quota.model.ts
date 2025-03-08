import { Collection } from '@/shared/decorators/collection.decorator';
import { IBaseEntity } from '@/shared/interfaces/base.repository';

@Collection('quotas')
export class Quota implements IBaseEntity {
    id!: string; // Fireorm requiere un ID explícito
    transactionId!: string;       // ID de la transacción asociada
    amount!: number;              // Monto de la cuota
    due_date!: Date;            // Fecha de vencimiento de la cuota
    status!: 'pending' | 'paid';  // Estado de la cuota
    currency!: string;            // Moneda de la cuota
    payment_date?: Date;        // Fecha de pago de la cuota (opcional)
    createdAt!: Date;
    updatedAt!: Date;
    deletedAt!: Date | null;
}
 