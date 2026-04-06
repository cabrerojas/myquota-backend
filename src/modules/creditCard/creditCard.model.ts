import { IBaseEntity } from '@/shared/interfaces/base.repository';

export class CreditCard implements IBaseEntity {
    id!: string;
    cardType!: string;
    cardLastDigits!: string;
    status!: string;
    cardHolderName!: string;
    billingPeriodStart!: Date;
    billingPeriodEnd!: Date;
    dueDate!: Date;
    nationalAmountUsed!: number;
    nationalAmountAvailable!: number;
    nationalTotalLimit!: number;
    nationalAdvanceAvailable!: number;
    internationalAmountUsed!: number;
    internationalAmountAvailable!: number;
    internationalTotalLimit!: number;
    internationalAdvanceAvailable!: number;
    createdAt!: Date;
    updatedAt!: Date;
    deletedAt!: Date | null;
}
