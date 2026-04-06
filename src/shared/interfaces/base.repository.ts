export interface IBaseEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
}


export interface IBaseRepository<T extends IBaseEntity> {
    create(data: Omit<T, keyof IBaseEntity>): Promise<T>;
    findAll(filters?: Partial<T>): Promise<T[]>;
    findById(id: string): Promise<T | null>;
    findOne(filters: Partial<T>): Promise<T | null>;
    update(id: string, data: Partial<Omit<T, keyof IBaseEntity>>): Promise<T | null>;
    delete(id: string): Promise<boolean>;
    softDelete(id: string): Promise<boolean>;
}