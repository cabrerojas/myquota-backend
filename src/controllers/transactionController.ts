import { Request, Response } from 'express';
import * as transactionService from '../services/transactionService';

export async function addTransaction(req: Request, res: Response) {
    try {

        console.log(req.body);
        const transaction = await transactionService.addTransaction(req.body);
        res.status(201).json(transaction);
    } catch (error) {
        res.status(500).json({ message: 'Error al agregar transacción', error });
    }
}

export async function getTransactions(req: Request, res: Response) {
    try {
        const transactions = await transactionService.getAllTransactions();
        res.status(200).json(transactions);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener transacciones', error });
    }
}

export async function importBankTransactions(req: Request, res: Response) {
    try {
        await transactionService.fetchBankEmails();
        res.status(200).json({ message: 'Transacciones importadas exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al importar transacciones', error });
    }
}