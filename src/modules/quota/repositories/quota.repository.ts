import { FirestoreRepository } from '@/shared/classes/firestore.repository';
import { getRepository } from 'fireorm';
import { Quota } from '../models/quota.model';

export class QuotaRepository extends FirestoreRepository<Quota> {

    constructor() {
        super(getRepository(Quota));
    }

    // Puedes agregar métodos específicos de repositorio aquí si es necesario

    async getQuotasByTransactionId(transactionId: string) {
        const quotas = await this.repository
            .whereEqualTo('transactionId', transactionId)
            .whereEqualTo('deletedAt', null)
            .find();
        return quotas;
    }

}