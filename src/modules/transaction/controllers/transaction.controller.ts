import { Request, Response } from 'express';
import { TransactionService } from '../services/transaction.service';

export class TransactionController {
    constructor(private readonly service: TransactionService) { }

    // Usar métodos de clase arrow functions para evitar problemas con el this
    getTransactions = async (_: Request, res: Response): Promise<void> => {
        try {
            const transactions = await this.service.findAll();
            res.status(200).json(transactions);
        } catch (error) {
            console.error('Error getting transactions:', error);
            res.status(500).json({
                message: 'Error al obtener transacciones',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    addTransaction = async (req: Request, res: Response): Promise<void> => {
        try {
            const transaction = await this.service.create(req.body);
            res.status(201).json(transaction);
        } catch (error) {
            console.error('Error adding transaction:', error);
            res.status(500).json({
                message: 'Error al agregar transacción',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    getTransaction = async (req: Request, res: Response): Promise<void> => {
        try {
            const { transactionId } = req.params;
            console.log('transactionId:', transactionId);
            const transaction = await this.service.findById(transactionId);

            if (!transaction) {
                res.status(404).json({ message: 'Transacción no encontrada' });
                return;
            }

            res.status(200).json(transaction);
        } catch (error) {
            console.error('Error getting transaction:', error);
            res.status(500).json({
                message: 'Error al obtener la transacción',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    updateTransaction = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const updatedData = req.body;
            const updatedTransaction = await this.service.update(id, updatedData);

            if (!updatedTransaction) {
                res.status(404).json({ message: 'Transacción no encontrada' });
                return;
            }

            res.status(200).json({
                message: 'Transacción actualizada exitosamente',
                data: updatedTransaction
            });
        } catch (error) {
            console.error('Error updating transaction:', error);
            res.status(500).json({
                message: 'Error al actualizar la transacción',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    deleteTransaction = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const result = await this.service.softDelete(id);

            if (!result) {
                res.status(404).json({ message: 'Transacción no encontrada' });
                return;
            }

            res.status(200).json({ message: 'Transacción eliminada correctamente' });
        } catch (error) {
            console.error('Error deleting transaction:', error);
            res.status(500).json({
                message: 'Error al eliminar la transacción',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    importBankTransactions = async (_: Request, res: Response): Promise<void> => {
        try {
            await this.service.fetchBankEmails();
            res.status(200).json({ message: 'Transacciones importadas exitosamente' });
        } catch (error) {
            console.error('Error importing transactions:', error);
            res.status(500).json({
                message: 'Error al importar transacciones',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };
}
