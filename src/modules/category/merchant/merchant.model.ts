import { IBaseEntity } from "@shared/interfaces/base.repository";

export class MerchantPattern implements IBaseEntity {
  id!: string;
  name!: string; // Ej: "BOTILLERIA LA PROMO"
  pattern!: string; // Ej: "BOTILLERIA"
  createdBy!: string; // userId
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt!: Date | null;
}
