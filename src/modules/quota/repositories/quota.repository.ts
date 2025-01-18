import { FirestoreRepository } from '@/shared/classes/firestore.repository';
import { Quota } from '../models/quota.model';

export class QuotaRepository extends FirestoreRepository<Quota> {

    constructor() {
        super('quotas');
    }

    // Puedes agregar métodos específicos de repositorio aquí si es necesario

    async getQuotasByTransactionId(transactionId: string): Promise<Quota[]> {
        try {
            const querySnapshot = await this.repository
                .where('transactionId', '==', transactionId)
                .where('deletedAt', '==', null)
                .get();
            return querySnapshot.docs.map(doc => doc.data() as Quota);
        } catch (error) {
            console.error('Error in QuotaRepository.getQuotasByTransactionId:', error);
            throw new Error('Error getting quotas by transaction ID');
        }
    }
}