import { IBaseEntity } from "@/shared/interfaces/base.repository";

export class Category implements IBaseEntity {
  id!: string;
  name!: string;
  normalizedName?: string;
  color?: string;
  icon?: string;
  userId?: string; // undefined for global categories
  parentId?: string | null; // optional hierarchy: subcategory → parent category
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;
}
