// src/shared/classes/firestore.repository.ts
import { RepositoryError } from '../errors/custom.error';
import { IBaseEntity, IBaseRepository } from '../interfaces/base.repository';
import { db } from '@/config/firebase';

export class FirestoreRepository<T extends IBaseEntity> implements IBaseRepository<T> {

    public repository: FirebaseFirestore.CollectionReference<T>;

    constructor(collectionName: string) {
        if (!collectionName) {
            throw new Error('Collection name is required');
        }

        // Inicializa la colección usando el nombre de la colección
        this.repository = db.collection(collectionName) as FirebaseFirestore.CollectionReference<T>;
    }

    async create(data: Omit<T, keyof IBaseEntity> & Partial<IBaseEntity>): Promise<T> {
        if (!data) {
            throw new RepositoryError('Data to create entity is required', 400);
        }

        const now = new Date();
        const id = data.id || this.repository.doc().id; // Usa data.id si existe, de lo contrario genera un nuevo ID
        const entity: T = {
            ...data,
            id,
            createdAt: now,
            updatedAt: now,
            deletedAt: null
        } as T; // Asegúrate de forzar el tipo correctamente

        try {
            await this.repository.doc(id).set(entity);
            return entity;
        } catch (error) {
            console.error('Error in FirestoreRepository.create:', error);
            throw new RepositoryError('Error creating entity', 500);
        }
    }

    async findAll(filters?: Partial<T>): Promise<T[]> {
        try {
            let query: FirebaseFirestore.Query<T> = this.repository.where('deletedAt', '==', null);

            if (filters) {
                Object.entries(filters).forEach(([key, value]) => {
                    query = query.where(key as string, '==', value);
                });
            }

            const snapshot = await query.get();
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('Error in FirestoreRepository.findAll:', error);
            throw new RepositoryError(`Error finding entities: ${error}`, 500);
        }
    }

    async findById(id: string): Promise<T | null> {
        try {
            const doc = await this.repository.doc(id).get();
            if (!doc.exists || doc.data()?.deletedAt) {
                return null;
            }
            return doc.data() as T;
        } catch (error) {
            console.error('Error in FirestoreRepository.findById:', error);
            throw new RepositoryError(`Error finding entity by ID ${id}`, 500);
        }
    }

    async findOne(filters: Partial<T>): Promise<T | null> {
        try {
            let query: FirebaseFirestore.Query<T> = this.repository.where('deletedAt', '==', null);

            Object.entries(filters).forEach(([key, value]) => {
                query = query.where(key as string, '==', value);
            });

            const snapshot = await query.limit(1).get();
            if (snapshot.empty) {
                return null;
            }
            return snapshot.docs[0].data();
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await this.repository.doc(id).update({ ...entity } as any);
            return entity;
        } catch (error) {
            console.error('Error in FirestoreRepository.update:', error);
            throw new RepositoryError('Error updating entity', 500);
        }
    }
    async delete(id: string): Promise<boolean> {
        try {
            const entity = await this.findById(id);
            if (!entity) return false;

            await this.repository.doc(id).delete();
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

            entity.deletedAt = new Date();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await this.repository.doc(id).update({ ...entity } as any);
            return true;
        } catch (error) {
            console.error('Error in FirestoreRepository.softDelete:', error);
            throw new RepositoryError('Error soft deleting entity', 500);
        }
    }
}