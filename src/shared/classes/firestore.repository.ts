// src/shared/classes/firestore.repository.ts
import { BaseFirestoreRepository, getRepository, IQueryable } from 'fireorm';
import { RepositoryError } from '../errors/custom.error';
import { IBaseEntity, IBaseRepository } from '../interfaces/base.repository';

export class FirestoreRepository<T extends IBaseEntity> implements IBaseRepository<T> {

    protected repository: BaseFirestoreRepository<T>;

    constructor(collectionName: string) {
        if (!collectionName) {
            throw new Error('Collection name is required');
        }

        // Inicializa el repositorio usando el nombre de la colección
        this.repository = getRepository<T>(collectionName);
    }


    async create(data: Omit<T, keyof IBaseEntity>): Promise<T> {
        if (!data) {
            throw new RepositoryError('Data to create entity is required', 400);
        }

        const now = new Date();
        const entity: T = {
            ...data,
            id: '', // O puedes asignar un valor por defecto si es necesario
            createdAt: now,
            updatedAt: now,
            deletedAt: null
        } as T; // Asegúrate de forzar el tipo correctamente

        try {
            return await this.repository.create(entity);
        } catch (error) {
            console.error('Error in FirestoreRepository.create:', error);
            throw new RepositoryError('Error creating entity', 500);
        }
    }


    async findAll(filters?: Partial<T>): Promise<T[]> {
        try {

            // Verificar que el repository está inicializado correctamente
            if (!this.repository) {
                throw new Error('Repository is not initialized');
            }

            // Inicializar la query base
            let query: IQueryable<T> = this.repository;

            // Aplicar filtros si existen
            if (filters) {
                Object.entries(filters).forEach(([key, value]) => {
                    query = query.whereEqualTo(key as keyof T, value);
                });
            }

            // Aplicar el filtro de deletedAt
            query = query.whereEqualTo('deletedAt', null);

            // Ejecutar la query y obtener los resultados
            const results = await query.find();
            return results;

        } catch (error) {
            console.error('Error in FirestoreRepository.findAll:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Error stack:', error.stack);
            }
            throw new RepositoryError(`Error finding entities: ${error}`, 500);
        }
    }


    async findById(id: string): Promise<T | null> {
        try {
            const entity = await this.repository.findById(id);
            if (!entity || entity['deletedAt']) {
                return null;
            }
            return entity;
        } catch (error) {
            console.error('Error in FirestoreRepository.findById:', error);
            throw new RepositoryError(`Error finding entity by ID ${id}`, 500);
        }
    }

    async findOne(filters: Partial<T>): Promise<T | null> {
        try {
            let query: IQueryable<T> = this.repository.whereEqualTo('deletedAt', null) as BaseFirestoreRepository<T>;

            Object.entries(filters).forEach(([key, value]) => {
                query = query.whereEqualTo(key as keyof T, value);
            });

            return await query.findOne();
        } catch (error) {
            console.error('Error in FirestoreRepository.findOne:', error);
            throw new RepositoryError('Error finding one entity', 500);
        }
    }

    async update(id: string, data: Partial<T>): Promise<T | null> {
        if (!id || !data) {
            throw new RepositoryError('ID and data to update are required', 400);
        }

        const entity = await this.findById(id);
        if (!entity) {
            throw new RepositoryError(`Entity with ID ${id} not found`, 404);
        }

        Object.assign(entity, {
            ...data,
            updatedAt: new Date()
        });

        try {
            return await this.repository.update(entity);
        } catch (error) {
            console.error('Error in FirestoreRepository.update:', error);
            throw new RepositoryError('Error updating entity', 500);
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const entity = await this.findById(id);
            if (!entity) return false;

            await this.repository.delete(id);
            return true;
        } catch (error) {
            console.error('Error in FirestoreRepository.delete:', error);
            throw new RepositoryError('Error deleting entity', 500);
        }
    }

    async softDelete(id: string): Promise<boolean> {
        try {
            const entity = await this.findById(id);
            if (!entity) return false;

            entity['deletedAt'] = new Date();
            await this.repository.update(entity);
            return true;
        } catch (error) {
            console.error('Error in FirestoreRepository.softDelete:', error);
            throw new RepositoryError('Error soft deleting entity', 500);
        }
    }
}
