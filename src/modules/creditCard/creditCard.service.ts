
import { BaseService } from '@/shared/classes/base.service';
import { CreditCard } from './creditCard.model';
import { CreditCardRepository } from './creditCard.repository';

export class CreditCardService extends BaseService<CreditCard> {
    // Cambiar el tipo del repository para acceder a los métodos específicos
    protected repository: CreditCardRepository;

    constructor(repository: CreditCardRepository) {
        super(repository);
        // Guardar la referencia al repository tipado
        this.repository = repository;
    }
}