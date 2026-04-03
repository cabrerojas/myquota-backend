import { ManualTransactionService } from "@/modules/transaction/manualTransaction.service";
import { TransactionRepository } from "@/modules/transaction/transaction.repository";

describe("ManualTransactionService.update", () => {
  const updatePayload = {
    merchant: "Store",
    purchaseDate: "2026-01-10T00:00:00.000Z",
    quotaAmount: 1000,
    totalInstallments: 3,
    paidInstallments: 1,
    lastPaidMonth: "2026-01",
    currency: "CLP",
  };

  it("updates transaction and quotas atomically", async () => {
    const repository = {
      findById: jest
        .fn()
        .mockResolvedValueOnce({ id: "tx-1", source: "manual" })
        .mockResolvedValueOnce({ id: "tx-1", source: "manual" }),
      updateTransactionAndReplaceQuotasAtomically: jest
        .fn()
        .mockResolvedValue({ deleted: 2, created: 3 }),
      deleteAllQuotas: jest.fn(),
      addQuota: jest.fn(),
      repository: { doc: () => ({ id: `q-${Math.random()}` }) },
    } as unknown as TransactionRepository;

    const service = new ManualTransactionService(repository);

    const result = await service.update("cc-1", "tx-1", updatePayload);

    expect(
      repository.updateTransactionAndReplaceQuotasAtomically,
    ).toHaveBeenCalledTimes(1);
    expect(
      repository.updateTransactionAndReplaceQuotasAtomically,
    ).toHaveBeenCalledWith(
      "tx-1",
      expect.objectContaining({
        merchant: "Store",
        amount: 1000,
        totalInstallments: 3,
        paidInstallments: 1,
      }),
      expect.arrayContaining([
        expect.objectContaining({ status: "paid", amount: 1000 }),
        expect.objectContaining({ status: "pending", amount: 1000 }),
      ]),
    );
    expect(repository.deleteAllQuotas).not.toHaveBeenCalled();
    expect(repository.addQuota).not.toHaveBeenCalled();
    expect(result.quotasCreated).toBe(3);
  });

  it("does not perform partial writes when atomic operation fails", async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({ id: "tx-1", source: "manual" }),
      updateTransactionAndReplaceQuotasAtomically: jest
        .fn()
        .mockRejectedValue(new Error("atomic commit failed")),
      deleteAllQuotas: jest.fn(),
      addQuota: jest.fn(),
      repository: { doc: () => ({ id: "q-id" }) },
    } as unknown as TransactionRepository;

    const service = new ManualTransactionService(repository);

    await expect(service.update("cc-1", "tx-1", updatePayload)).rejects.toThrow(
      "atomic commit failed",
    );

    expect(
      repository.updateTransactionAndReplaceQuotasAtomically,
    ).toHaveBeenCalledTimes(1);
    expect(repository.deleteAllQuotas).not.toHaveBeenCalled();
    expect(repository.addQuota).not.toHaveBeenCalled();
  });
});
