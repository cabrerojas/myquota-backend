import { StatsService } from "@/modules/stats/stats.service";
import { TransactionService } from "./transaction.service";
import { RepositoryError } from "@/shared/errors/custom.error";
import { Transaction } from "./transaction.model";
import { Quota } from "@/modules/quota/quota.model";

const baseTransaction: Transaction = {
  id: "tx-1",
  amount: 100,
  currency: "CLP",
  cardType: "Tarjeta de Credito",
  cardLastDigits: "1234",
  merchant: "Steam",
  transactionDate: new Date("2026-01-10T00:00:00.000Z"),
  bank: "Banco de Chile",
  email: "enviodigital@bancochile.cl",
  createdAt: new Date("2026-01-10T00:00:00.000Z"),
  updatedAt: new Date("2026-01-10T00:00:00.000Z"),
  deletedAt: null,
  creditCardId: "card-1",
  source: "email",
};

const baseQuota: Quota = {
  id: "quota-1",
  transactionId: "tx-1",
  amount: 100,
  currency: "CLP",
  dueDate: new Date("2026-01-10T00:00:00.000Z"),
  status: "pending",
  paymentDate: null,
  createdAt: new Date("2026-01-10T00:00:00.000Z"),
  updatedAt: new Date("2026-01-10T00:00:00.000Z"),
  deletedAt: null,
};

describe("TransactionService refunds", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates a partial refund and updates the summary", async () => {
    const repository = {
      findAll: jest.fn(),
      findById: jest
        .fn()
        .mockResolvedValueOnce(baseTransaction)
        .mockResolvedValueOnce(baseTransaction),
      getQuotas: jest.fn().mockResolvedValue([baseQuota]),
      findRefundsByParentIds: jest
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          [baseTransaction.id]: [
            {
              id: "refund-1",
              amount: 40,
              currency: "CLP",
              transactionDate: new Date("2026-01-15T00:00:00.000Z"),
              createdAt: new Date("2026-01-15T00:00:00.000Z"),
              refundReason: "Partial return",
            },
          ],
        }),
      create: jest.fn().mockResolvedValue({
        ...baseTransaction,
        id: "refund-1",
        amount: -40,
        source: "refund",
        parentTransactionId: baseTransaction.id,
        refundReason: "Partial return",
      }),
      addQuota: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(true),
    };

    const service = new TransactionService(
      repository as never,
      { findAll: jest.fn() } as never,
      {} as never,
      {
        getAllCategories: jest.fn().mockResolvedValue([]),
        registerMerchantMapping: jest.fn(),
      } as never,
      { buildMerchantCategoryMapAsync: jest.fn() },
    );

    const result = await service.createRefund(baseTransaction.id, {
      amount: 40,
      reason: "Partial return",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: -40,
        source: "refund",
        parentTransactionId: baseTransaction.id,
      }),
    );
    expect(repository.addQuota).toHaveBeenCalledWith(
      baseTransaction.creditCardId,
      "refund-1",
      expect.objectContaining({ amount: -40, status: "pending" }),
    );
    expect(result.transaction.refundStatus).toBe("partial");
    expect(result.transaction.refundedAmount).toBe(40);
    expect(result.transaction.refundableAmount).toBe(60);
    expect(result.transaction.canRefund).toBe(true);
  });

  it("prevents over-refunding", async () => {
    const repository = {
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(baseTransaction),
      getQuotas: jest.fn().mockResolvedValue([baseQuota]),
      findRefundsByParentIds: jest.fn().mockResolvedValue({
        [baseTransaction.id]: [
          {
            id: "refund-1",
            amount: 80,
            currency: "CLP",
            transactionDate: new Date("2026-01-15T00:00:00.000Z"),
            createdAt: new Date("2026-01-15T00:00:00.000Z"),
          },
        ],
      }),
      create: jest.fn(),
      addQuota: jest.fn(),
      delete: jest.fn(),
    };

    const service = new TransactionService(
      repository as never,
      { findAll: jest.fn() } as never,
      {} as never,
      {
        getAllCategories: jest.fn().mockResolvedValue([]),
        registerMerchantMapping: jest.fn(),
      } as never,
      { buildMerchantCategoryMapAsync: jest.fn() },
    );

    await expect(
      service.createRefund(baseTransaction.id, { amount: 30 }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RepositoryError>>({
        statusCode: 400,
      }),
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("invalidates stats lazily for category-only transaction updates", async () => {
    const invalidateOnlySpy = jest
      .spyOn(StatsService, "triggerInvalidateOnly")
      .mockImplementation(() => undefined);
    const recomputeSpy = jest
      .spyOn(StatsService, "triggerRecompute")
      .mockImplementation(() => undefined);
    const registerMerchantMapping = jest.fn().mockResolvedValue(undefined);
    const repository = {
      findAll: jest.fn(),
      update: jest.fn().mockResolvedValue({
        ...baseTransaction,
        categoryId: "category-1",
      }),
    };

    const service = new TransactionService(
      repository as never,
      { findAll: jest.fn() } as never,
      {} as never,
      {
        getAllCategories: jest.fn().mockResolvedValue([
          { id: "category-1", name: "Food", icon: "fork", color: "#fff" },
        ]),
        registerMerchantMapping,
      } as never,
      { buildMerchantCategoryMapAsync: jest.fn() },
    );

    const result = await service.updateTransaction(
      baseTransaction.id,
      { categoryId: "category-1" },
      "user-1",
    );

    expect(result).toEqual(
      expect.objectContaining({ categoryName: "Food", categoryId: "category-1" }),
    );
    expect(registerMerchantMapping).toHaveBeenCalledWith(
      "category-1",
      baseTransaction.merchant,
      "user-1",
    );
    expect(invalidateOnlySpy).toHaveBeenCalledWith("user-1", baseTransaction.creditCardId);
    expect(recomputeSpy).not.toHaveBeenCalled();
  });

  it("lists transactions with refund summary and falls back when category enrichment fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const repository = {
      findAll: jest.fn().mockResolvedValue({
        items: [baseTransaction],
        metadata: { hasMore: false, nextCursor: null },
      }),
      findRefundsByParentIds: jest.fn().mockResolvedValue({}),
    };

    const service = new TransactionService(
      repository as never,
      { findAll: jest.fn() } as never,
      {} as never,
      {
        getAllCategories: jest.fn().mockRejectedValue(new Error("cache miss")),
        registerMerchantMapping: jest.fn(),
      } as never,
      { buildMerchantCategoryMapAsync: jest.fn() },
    );

    const result = await service.listTransactions({
      categoryId: "category-1",
      endDate: "2026-01-31",
      limit: "10",
      startAfter: "tx-0",
      startDate: "2026-01-01",
    });

    expect(repository.findAll).toHaveBeenCalledWith(
      { categoryId: "category-1" },
      {
        limit: 10,
        startAfter: "tx-0",
        orderBy: "transactionDate",
        orderDirection: "desc",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    );
    expect(result.items).toEqual([
      expect.objectContaining({ id: baseTransaction.id, refundStatus: "none" }),
    ]);
  });

  it("recomputes stats after manual transaction creation", async () => {
    const recomputeSpy = jest
      .spyOn(StatsService, "triggerRecompute")
      .mockImplementation(() => undefined);
    const repository = {
      findAll: jest.fn(),
    };

    const service = new TransactionService(
      repository as never,
      { findAll: jest.fn() } as never,
      {} as never,
      {
        getAllCategories: jest.fn().mockResolvedValue([]),
        registerMerchantMapping: jest.fn(),
      } as never,
      { buildMerchantCategoryMapAsync: jest.fn() },
    );

    const createSpy = jest
      .spyOn(service["manualTransactionService"], "create")
      .mockResolvedValue({ transaction: baseTransaction, quotasCreated: 3 });

    const result = await service.createManualTransaction(
      baseTransaction.creditCardId,
      {
        merchant: baseTransaction.merchant,
        purchaseDate: "2026-01-10",
        quotaAmount: 100,
        totalInstallments: 3,
        paidInstallments: 1,
        lastPaidMonth: "2026-01",
        currency: "CLP",
      },
      "user-1",
    );

    expect(createSpy).toHaveBeenCalled();
    expect(result.quotasCreated).toBe(3);
    expect(recomputeSpy).toHaveBeenCalledWith("user-1", baseTransaction.creditCardId);
  });

  it("recomputes stats after quota initialization when quotas were created", async () => {
    const recomputeSpy = jest
      .spyOn(StatsService, "triggerRecompute")
      .mockImplementation(() => undefined);
    const repository = {
      findAll: jest.fn().mockResolvedValue({
        items: [baseTransaction],
        metadata: { hasMore: false, nextCursor: null },
      }),
      getQuotas: jest.fn().mockResolvedValue([]),
      addQuotaIfAbsent: jest.fn().mockResolvedValue(true),
    };

    const service = new TransactionService(
      repository as never,
      { findAll: jest.fn() } as never,
      {} as never,
      {
        getAllCategories: jest.fn().mockResolvedValue([]),
        registerMerchantMapping: jest.fn(),
      } as never,
      { buildMerchantCategoryMapAsync: jest.fn() },
    );

    const result = await service.initializeQuotasForAllTransactions(
      baseTransaction.creditCardId,
      undefined,
      "user-1",
    );

    expect(result).toBe(1);
    expect(recomputeSpy).toHaveBeenCalledWith("user-1", baseTransaction.creditCardId);
  });

  it("recomputes stats after a successful import flow", async () => {
    const recomputeSpy = jest
      .spyOn(StatsService, "triggerRecompute")
      .mockImplementation(() => undefined);
    const repository = {
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(baseTransaction),
      findWithoutQuotas: jest.fn().mockResolvedValue([]),
      getQuotas: jest.fn().mockResolvedValue([]),
    };

    const service = new TransactionService(
      repository as never,
      { findAll: jest.fn().mockResolvedValue({ items: [], metadata: {} }) } as never,
      {} as never,
      {
        getAllCategories: jest.fn().mockResolvedValue([]),
        registerMerchantMapping: jest.fn(),
      } as never,
      { buildMerchantCategoryMapAsync: jest.fn() },
    );

    jest.spyOn(service, "fetchBankEmails").mockResolvedValue({
      importedCount: 1,
      importedTransactionIds: [baseTransaction.id],
    });
    jest.spyOn(service, "initializeQuotasForAllTransactions").mockResolvedValue(2);
    jest.spyOn(service, "checkOrphanedTransactions").mockResolvedValue({
      orphanedTransactions: [],
      suggestedPeriod: null,
    });

    await service.runImportFlow("user-1", baseTransaction.creditCardId);

    expect(recomputeSpy).toHaveBeenCalledWith("user-1", baseTransaction.creditCardId);
  });
});
