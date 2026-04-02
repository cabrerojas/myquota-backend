import { BillingPeriodRepository } from "@/modules/billingPeriod/billingPeriod.repository";
import { CreditCardRepository } from "@/modules/creditCard/creditCard.repository";
import { TransactionService } from "@/modules/transaction/transaction.service";
import { Transaction } from "@/modules/transaction/transaction.model";
import { TransactionRepository } from "@/modules/transaction/transaction.repository";

jest.mock("@/modules/transaction/emailImport.service", () => ({
  EmailImportService: class {
    fetchBankEmails = jest.fn().mockResolvedValue({ importedCount: 0 });
  },
}));

class InMemoryTransactionRepository {
  public createdQuotaIds = new Set<string>();

  async addQuotaIfAbsent(
    _creditCardId: string,
    _transactionId: string,
    quota: { id: string },
  ): Promise<boolean> {
    if (this.createdQuotaIds.has(quota.id)) {
      return false;
    }

    this.createdQuotaIds.add(quota.id);
    return true;
  }
}

const buildTransaction = (id: string): Transaction => ({
  id,
  amount: 1000,
  currency: "CLP",
  cardType: "credit",
  cardLastDigits: "1234",
  merchant: "Test Store",
  transactionDate: new Date("2026-01-15T00:00:00.000Z"),
  bank: "test-bank",
  email: "test@example.com",
  createdAt: new Date("2026-01-15T00:00:00.000Z"),
  updatedAt: new Date("2026-01-15T00:00:00.000Z"),
  deletedAt: null,
  creditCardId: "credit-card-1",
});

describe("TransactionService.initializeQuotasForAllTransactions", () => {
  it("is idempotent under retries", async () => {
    const repository = new InMemoryTransactionRepository();
    const service = new TransactionService(
      repository as unknown as TransactionRepository,
      {} as BillingPeriodRepository,
      {} as CreditCardRepository,
    );

    const transactions = [buildTransaction("tx-1"), buildTransaction("tx-2")];

    const firstRun = await service.initializeQuotasForAllTransactions(
      "credit-card-1",
      transactions,
    );
    const secondRun = await service.initializeQuotasForAllTransactions(
      "credit-card-1",
      transactions,
    );

    expect(firstRun).toBe(2);
    expect(secondRun).toBe(0);
    expect(Array.from(repository.createdQuotaIds)).toEqual(["tx-1", "tx-2"]);
  });

  it("avoids duplicates when called concurrently", async () => {
    const repository = new InMemoryTransactionRepository();
    const service = new TransactionService(
      repository as unknown as TransactionRepository,
      {} as BillingPeriodRepository,
      {} as CreditCardRepository,
    );

    const transactions = [
      buildTransaction("tx-1"),
      buildTransaction("tx-2"),
      buildTransaction("tx-3"),
    ];

    const runs = await Promise.all([
      service.initializeQuotasForAllTransactions("credit-card-1", transactions),
      service.initializeQuotasForAllTransactions("credit-card-1", transactions),
      service.initializeQuotasForAllTransactions("credit-card-1", transactions),
    ]);

    const createdAcrossRuns = runs.reduce((total, current) => total + current, 0);

    expect(createdAcrossRuns).toBe(3);
    expect(repository.createdQuotaIds.size).toBe(3);
    expect(Array.from(repository.createdQuotaIds).sort()).toEqual([
      "tx-1",
      "tx-2",
      "tx-3",
    ]);
  });
});
