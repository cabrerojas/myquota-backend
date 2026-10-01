import {
  createBillingPeriodSchema,
  updateBillingPeriodSchema,
} from "./billingPeriod.schemas";
import { BillingPeriodService } from "./billingPeriod.service";

const billingPeriodInput = {
  creditCardId: "card-1",
  month: "2026-03",
  startDate: "2026-03-01T00:00:00.000Z",
  endDate: "2026-03-31T23:59:59.000Z",
  dueDate: "2026-04-05T23:59:59.000Z",
};

const serviceBillingPeriodInput = {
  ...billingPeriodInput,
  startDate: new Date(billingPeriodInput.startDate),
  endDate: new Date(billingPeriodInput.endDate),
  dueDate: new Date(billingPeriodInput.dueDate),
};

describe("BillingPeriod month validation", () => {
  it.each(["2026-03", "0000-01", "9999-12"])(
    "accepts the canonical month %s in create and update schemas",
    (month) => {
      expect(createBillingPeriodSchema.safeParse({ ...billingPeriodInput, month }).success).toBe(true);
      expect(updateBillingPeriodSchema.safeParse({ month }).success).toBe(true);
    },
  );

  it.each([
    "2026-3",
    "2026-00",
    "2026-13",
    "2026-02-extra",
    "202603",
    " 2026-03",
    "",
  ])("rejects invalid or overlong month %j at the HTTP schema boundary", (month) => {
    expect(createBillingPeriodSchema.safeParse({ ...billingPeriodInput, month }).success).toBe(false);
    expect(updateBillingPeriodSchema.safeParse({ month }).success).toBe(false);
  });

  it("passes the canonical month to persistence on create and update", async () => {
    const repository = {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };
    const service = new BillingPeriodService(repository as never);

    await service.create(serviceBillingPeriodInput);
    await service.update("period-1", { month: billingPeriodInput.month });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ month: "2026-03" }),
    );
    expect(repository.update).toHaveBeenCalledWith(
      "period-1",
      expect.objectContaining({ month: "2026-03" }),
    );
  });

  it.each(["2026-3", "2026-00", "2026-13", "2026-02-extra"])(
    "rejects invalid programmatic month %j without persistence",
    async (month) => {
      const repository = {
        create: jest.fn(),
        update: jest.fn(),
      };
      const service = new BillingPeriodService(repository as never);

      await expect(service.create({ ...serviceBillingPeriodInput, month })).rejects.toThrow();
      await expect(service.update("period-1", { month })).rejects.toThrow();

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    },
  );
});
