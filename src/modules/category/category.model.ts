import { IBaseEntity } from "@/shared/interfaces/base.repository";

export class Category implements IBaseEntity {
  id!: string;
  name!: string;
  normalizedName?: string;
  color?: string;
  icon?: string;
  userId?: string; // undefined for global categories
  isGlobal?: boolean; // true = shared across all users
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;
}