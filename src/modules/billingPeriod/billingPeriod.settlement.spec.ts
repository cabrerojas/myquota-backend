import { readFileSync } from "node:fs";
import { join } from "node:path";

import { StatsService } from "@/modules/stats/stats.service";
import { BillingPeriodService } from "./billingPeriod.service";

const settlementOutcome = {
  settlementId: "settlement-1",
  billingPeriodId: "period-1",
  creditCardId: "card-1",
  settledAt: "2026-07-06T12:00:00.000Z",
  alreadySettled: false,
  settledQuotaCount: 81,
  settledTotalAmount: 123456,
  lines: [
    {
      quotaId: "quota-1",
      transactionId: "transaction-1",
      amount: 123456,
      currency: "CLP",
      dueDate: "2026-07-05",
    },
  ],
};

describe("BillingPeriodService statement settlement", () => {
  it("delegates the complete settlement to one repository RPC and invalidates forecasts", async () => {
    const repository = {
      settleBillingPeriod: jest.fn().mockResolvedValue(settlementOutcome),
    };
    const triggerRecompute = jest
      .spyOn(StatsService, "triggerRecompute")
      .mockImplementation(() => undefined);
    const service = new BillingPeriodService(
      repository as never,
      "card-1",
      "user-1",
    );

    await expect(service.settleBillingPeriod("period-1")).resolves.toEqual(
      settlementOutcome,
    );

    expect(repository.settleBillingPeriod).toHaveBeenCalledWith("period-1", "user-1");
    expect(triggerRecompute).toHaveBeenCalledWith("user-1", "card-1");
  });

  it("does not require a caller-supplied historical payment date", async () => {
    const repository = {
      settleBillingPeriod: jest.fn().mockResolvedValue(settlementOutcome),
    };
    const service = new BillingPeriodService(
      repository as never,
      "card-1",
      "user-1",
    );

    await service.settleBillingPeriod("period-1");

    expect(repository.settleBillingPeriod).toHaveBeenCalledWith("period-1", "user-1");
  });
});

describe("settle_billing_period migration contract", () => {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/006_settle_billing_periods.sql",
  );

  const readMigration = (): string => readFileSync(migrationPath, "utf8");

  it("uses transaction-date statement membership and preserves future installments", () => {
    const migration = readMigration();

    expect(migration).toMatch(
      /t\.transaction_date\s+BETWEEN\s+v_period\.start_date\s+AND\s+v_period\.end_date/i,
    );
    expect(migration).toMatch(/q\.due_date\s*<=\s*v_period\.due_date/i);
    expect(migration).toMatch(/t\.parent_transaction_id\s+IS\s+NULL/i);
    expect(migration).toMatch(/q\.status\s*=\s*'pending'/i);
  });

  it("records an immutable, idempotent, zero-balance-capable settlement without a 50-row cap", () => {
    const migration = readMigration();

    expect(migration).toMatch(/CREATE TABLE.*billing_period_settlements/is);
    expect(migration).toMatch(/CREATE TABLE.*billing_period_settlement_lines/is);
    expect(migration).toMatch(/UNIQUE\s*\(billing_period_id\)/i);
    expect(migration).toMatch(/ON CONFLICT\s*\(billing_period_id\)/i);
    expect(migration).toMatch(/settled_total_amount\s+NUMERIC\(12,\s*2\)\s+NOT NULL\s+DEFAULT\s+0/i);
    expect(migration).not.toMatch(/LIMIT\s+50/i);
  });
});
