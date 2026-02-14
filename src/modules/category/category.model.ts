import { IBaseEntity } from "@/shared/interfaces/base.repository";

export class Category implements IBaseEntity {
  id!: string;
  name!: string;
  color?: string;
  icon?: string;
  userId?: string; // undefined for global categories
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;
}
