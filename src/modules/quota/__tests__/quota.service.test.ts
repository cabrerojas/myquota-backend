import { QuotaService } from "@/modules/quota/quota.service";
import { QuotaRepository } from "@/modules/quota/quota.repository";
import { TransactionRepository } from "@/modules/transaction/transaction.repository";

describe("QuotaService.splitTransactionIntoQuotas", () => {
  const buildService = (transactionRepository: Partial<TransactionRepository>) =>
    new QuotaService(
      {} as QuotaRepository,
      transactionRepository as TransactionRepository,
    );

  it("replaces quotas atomically in a single repository call", async () => {
    const findById = jest.fn().mockResolvedValue({
      id: "tx-1",
      amount: 1000,
      currency: "CLP",
      transactionDate: "2026-01-10T00:00:00.000Z",
    });
    const replaceQuotasAtomically = jest.fn().mockResolvedValue({
      deleted: 2,
      created: 3,
    });

    const service = buildService({
      findById,
      replaceQuotasAtomically,
      deleteAllQuotas: jest.fn(),
      addQuota: jest.fn(),
      repository: { doc: () => ({ id: "generated-id" }) },
    } as unknown as TransactionRepository);

    const result = await service.splitTransactionIntoQuotas("cc-1", "tx-1", 3);

    expect(replaceQuotasAtomically).toHaveBeenCalledTimes(1);
    expect(replaceQuotasAtomically).toHaveBeenCalledWith(
      "tx-1",
      expect.arrayContaining([
        expect.objectContaining({ amount: 333, status: "pending" }),
        expect.objectContaining({ amount: 334, status: "pending" }),
      ]),
    );
    expect(result.deleted).toBe(2);
    expect(result.created).toBe(3);
  });

  it("bubbles up atomic replace failures without fallback writes", async () => {
    const replaceQuotasAtomically = jest
      .fn()
      .mockRejectedValue(new Error("commit failed"));
    const deleteAllQuotas = jest.fn();
    const addQuota = jest.fn();

    const service = buildService({
      findById: jest.fn().mockResolvedValue({
        id: "tx-1",
        amount: 500,
        currency: "CLP",
        transactionDate: "2026-01-10T00:00:00.000Z",
      }),
      replaceQuotasAtomically,
      deleteAllQuotas,
      addQuota,
      repository: { doc: () => ({ id: "generated-id" }) },
    } as unknown as TransactionRepository);

    await expect(
      service.splitTransactionIntoQuotas("cc-1", "tx-1", 2),
    ).rejects.toThrow("commit failed");

    expect(replaceQuotasAtomically).toHaveBeenCalledTimes(1);
    expect(deleteAllQuotas).not.toHaveBeenCalled();
    expect(addQuota).not.toHaveBeenCalled();
  });
});
