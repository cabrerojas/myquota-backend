import { Request, Response } from 'express';
import { transactionService } from './transaction.service';


const addTransaction = async (req: Request, res: Response) => {
    try {

        console.log(req.body);
        const transaction = await transactionService.addTransaction(req.body);
        res.status(201).json(transaction);
    } catch (error) {
        res.status(500).json({ message: 'Error al agregar transacción', error });
    }
}

const getTransactions = async (req: Request, res: Response) => {
    try {
        const transactions = await transactionService.getAllTransactions();
        res.status(200).json(transactions);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener transacciones', error });
    }
}

const getTransaction = async (req: Request, res: Response) => {
    try {
        const { transactionId } = req.params;
        const transaction = await transactionService.getTransactionById(transactionId);
        if (!transaction) res.status(404).json({ message: 'Transacción no encontrada' });
        else res.status(200).json(transaction);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener la transacción', error });
    }
};

const importBankTransactions = async (req: Request, res: Response) => {
    try {
        await transactionService.fetchBankEmails();
        res.status(200).json({ message: 'Transacciones importadas exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al importar transacciones', error });
    }
};

const updateTransaction = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        await transactionService.updateTransactionById(id, updatedData);
        res.status(200).json({ message: 'Transacción actualizada exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar la transacción', error });
    }
};

export const deleteTransaction = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await transactionService.deleteTransactionById(id);
        res.status(200).json({ message: 'Transacción eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar la transacción', error });
    }
};


export { getTransaction, importBankTransactions, addTransaction, getTransactions, updateTransaction };