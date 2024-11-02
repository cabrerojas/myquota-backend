import { IBaseEntity, IBaseRepository } from "../interfaces/base.repository";
import { IBaseService } from "../interfaces/base.service";

export abstract class BaseService<T extends IBaseEntity>
    implements IBaseService<T> {

    constructor(protected repository: IBaseRepository<T>) { }

    async create(data: Omit<T, keyof IBaseEntity>): Promise<T> {
        return await this.repository.create(data);
    }

    async findAll(filters?: Partial<T>): Promise<T[]> {
        return await this.repository.findAll(filters);
    }

    async findById(id: string): Promise<T | null> {
        return await this.repository.findById(id);
    }

    async findOne(filters: Partial<T>): Promise<T | null> {
        return await this.repository.findOne(filters);
    }

    async update(id: string, data: Partial<Omit<T, keyof IBaseEntity>>): Promise<T | null> {
        return await this.repository.update(id, data);
    }

    async delete(id: string): Promise<boolean> {
        return await this.repository.delete(id);
    }

    async softDelete(id: string): Promise<boolean> {
        if (this.repository.softDelete) {
            return await this.repository.softDelete(id);
        }
        return false;
    }
}
