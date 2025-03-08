import { IBaseEntity } from '@/shared/interfaces/base.repository';

export class User implements IBaseEntity {
  id!: string;
  email!: string;
  name!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;
}
