// src/modules/quota/services/quota.service.ts
import { Quota } from "../models/quota.model";
import { QuotaRepository } from "../repositories/quota.repository";
import { convertUtcToChileTime } from "@/shared/utils/date.utils";
import { format } from "date-fns-tz";
import { BaseService } from "@/shared/classes/base.service";
import { TransactionRepository } from "@/modules/transaction/repositories/transaction.repository";
import { CreditCardRepository } from "@/modules/creditCard/repositories/creditCard.repository";

export class QuotaService extends BaseService<Quota> {
  // Cambiar el tipo del repository para acceder a los métodos específicos
  protected repository: QuotaRepository;
  protected transactionRepository: TransactionRepository;
  protected creditCardRepository: CreditCardRepository;

  constructor(
    repository: QuotaRepository,
    transactionRepository: TransactionRepository,
    creditCardRepository: CreditCardRepository
  ) {
    super(repository);
    // Guardar la referencia al repository tipado
    this.repository = repository;
    this.transactionRepository = transactionRepository;
    this.creditCardRepository = creditCardRepository;
  }

  // Otros métodos específicos del servicio

  async initializeQuotasForAllTransactions(cardLastDigits: string) {
    // Obtener tarjetas de crédito
    const creditCard = await this.creditCardRepository.findOne({
      cardLastDigits,
    });

    if (!creditCard) {
      console.warn("No se encontraron tarjetas de crédito para procesar.");
      return;
    }

    // Obtener todas las transacciones de las tarjetas de crédito
    const creditCardTransactions =
      await this.creditCardRepository.getTransactions(creditCard.id);

    // Aplanar el array de transacciones de tarjetas de crédito
    const allTransactions = creditCardTransactions.flat();

    if (allTransactions.length === 0) {
      console.warn("No se encontraron transacciones para procesar.");
      return;
    }

    // Obtener las cuotas existentes de las subcolecciones de cuotas dentro de las transacciones
    const existingQuotas = await Promise.all(
      allTransactions.map(async (transaction) => {
        return await this.transactionRepository.getQuotas(
          transaction.creditCardId,
          transaction.id
        );
      })
    );

    // Aplanar el array de cuotas existentes
    const allExistingQuotas = existingQuotas.flat();
    const existingQuotaIds = allExistingQuotas.map(
      (quota) => quota.transactionId
    );

    // Filtrar las transacciones que no tienen cuotas creadas
    const transactionsWithoutQuotas = allTransactions.filter(
      (transaction) => !existingQuotaIds.includes(transaction.id)
    );

    if (transactionsWithoutQuotas.length === 0) {
      console.warn("Todas las transacciones ya tienen cuotas creadas.");
      return;
    }

    // Crear cuotas en paralelo usando Promise.all
    await Promise.all(
      transactionsWithoutQuotas.map(async (transaction) => {
        const quotaData: Quota = {
          id: this.repository.repository.doc().id, // Generar un ID único para la cuota
          transactionId: transaction.id,
          amount: transaction.amount,
          due_date: transaction.transactionDate, // Fecha estimada de vencimiento
          status: "pending" as const,
          currency: transaction.currency,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };

        // Crear la cuota para la transacción
        await this.transactionRepository.addQuota(
          transaction.creditCardId,
          transaction.id,
          quotaData
        );
        console.warn(
          `Cuota creada para la transacción con ID ${transaction.id}`
        );
      })
    );

    console.warn(
      `Cuotas creadas para ${transactionsWithoutQuotas.length} transacciones.`
    );
  }
  // Otros métodos específicos del servicio

  async getMonthlyQuotaSum(
    cardLastDigits?: string
  ): Promise<{ month: string; currency: string; totalAmount: number }[]> {
    try {

      if (!cardLastDigits) {
        console.warn("No se proporcionó el número de tarjeta de crédito.");
        return [];
      }

      console.warn("Obteniendo sumatoria de cuotas por mes...");

      // Obtener tarjetas de crédito
      const creditCard = await this.creditCardRepository.findOne({
        cardLastDigits
      });

      if (!creditCard) {
        console.warn("No se encontraron tarjetas de crédito para procesar.");
        return [];
      }

      // Obtener todas las transacciones de las tarjetas de crédito
      const creditCardTransactions =
        await this.creditCardRepository.getTransactions(creditCard.id);

      // Aplanar el array de transacciones de tarjetas de crédito
      const allTransactions = creditCardTransactions.flat();

      if (allTransactions.length === 0) {
        console.warn("No se encontraron transacciones para procesar.");
        return [];
      }

      // Obtener todas las cuotas de las transacciones
      const quotas = await Promise.all(
        allTransactions.map(async (transaction) => {
          return await this.transactionRepository.getQuotas(
            transaction.creditCardId,
            transaction.id
          );
        })
      );

      // Aplanar el array de cuotas
      const allQuotas = quotas.flat();

      const monthlySumMap: { [key: string]: { [currency: string]: number } } =
        {};

      allQuotas.forEach((quota: Quota) => {
        if (quota.due_date) {
          const dueDate = Array.isArray(quota.due_date)
            ? quota.due_date[0]
            : quota.due_date;
          try {
            const localDueDate = convertUtcToChileTime(dueDate);
            const monthKey = format(new Date(localDueDate), "yyyy-MM");

            if (!monthlySumMap[monthKey]) {
              monthlySumMap[monthKey] = {};
            }

            if (!monthlySumMap[monthKey][quota.currency]) {
              monthlySumMap[monthKey][quota.currency] = 0;
            }

            monthlySumMap[monthKey][quota.currency] += quota.amount;
          } catch (error) {
            console.error("Error al convertir la fecha:", dueDate, error);
          }
        }
      });

      // Convertir el objeto de sumas mensuales a un array de resultados
      const monthlySumArray = Object.entries(monthlySumMap).flatMap(
        ([month, currencyMap]) =>
          Object.entries(currencyMap).map(([currency, totalAmount]) => ({
            month,
            currency,
            totalAmount,
          }))
      );

      return monthlySumArray;
    } catch (error) {
      console.error(
        "Error al obtener la sumatoria de las cuotas por mes:",
        error
      );
      throw error;
    }
  }

  async getQuotasByTransaction(creditCardId: string, transactionId: string) {
    return await this.transactionRepository.getQuotas(
      creditCardId,
      transactionId
    );
  }
}
