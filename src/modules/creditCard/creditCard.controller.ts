
import { Request, Response } from 'express';
import { CreditCardService } from './creditCard.service';

export class CreditCardController {
    constructor(private readonly service: CreditCardService) { }

    // Usar métodos de clase arrow functions para evitar problemas con el this
    getCreditCards = async (_: Request, res: Response): Promise<void> => {
        try {
            const CreditCards = await this.service.findAll();
            res.status(200).json(CreditCards);
        } catch (error) {
            console.error('Error getting CreditCards:', error);
            res.status(500).json({
                message: 'Error al obtener CreditCards',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    addCreditCard = async (req: Request, res: Response): Promise<void> => {
        try {
            const CreditCard = await this.service.create(req.body);
            res.status(201).json(CreditCard);
        } catch (error) {
            console.error('Error adding CreditCard:', error);
            res.status(500).json({
                message: 'Error al agregar CreditCard',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    getCreditCard = async (req: Request, res: Response): Promise<void> => {
        try {
            const { creditCardId } = req.params;
            console.log("CreditCardId:", req.params);
            const CreditCard = await this.service.findById(creditCardId);

            if (!CreditCard) {
                res.status(404).json({ message: 'CreditCard no encontrada' });
                return;
            }

            res.status(200).json(CreditCard);
        } catch (error) {
            console.error('Error getting CreditCard:', error);
            res.status(500).json({
                message: 'Error al obtener la CreditCard',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    updateCreditCard = async (req: Request, res: Response): Promise<void> => {
        try {
            const { creditCardId } = req.params;
            const updatedData = req.body;
            console.log("CreditCardId:", creditCardId);
            console.log("UpdatedData:", updatedData);
            const updatedCreditCard = await this.service.update(
              creditCardId,
              updatedData
            );

            if (!updatedCreditCard) {
                res.status(404).json({ message: 'CreditCard no encontrada' });
                return;
            }

            res.status(200).json({
                message: 'CreditCard actualizada exitosamente',
                data: updatedCreditCard
            });
        } catch (error) {
            console.error('Error updating CreditCard:', error);
            res.status(500).json({
                message: 'Error al actualizar la CreditCard',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    deleteCreditCard = async (req: Request, res: Response): Promise<void> => {
        try {
            const { creditCardId } = req.params;
            const result = await this.service.softDelete(creditCardId);

            if (!result) {
                res.status(404).json({ message: 'CreditCard no encontrada' });
                return;
            }

            res.status(200).json({ message: 'CreditCard eliminada correctamente' });
        } catch (error) {
            console.error('Error deleting CreditCard:', error);
            res.status(500).json({
                message: 'Error al eliminar la CreditCard',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };
}