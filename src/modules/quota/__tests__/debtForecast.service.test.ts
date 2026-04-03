type MockDoc = {
  data: () => Record<string, unknown>;
  ref: {
    path: string;
  };
};

const buildDoc = (path: string, data: Record<string, unknown>): MockDoc => ({
  data: () => data,
  ref: { path },
});

jest.mock("@/config/firebase", () => {
  const collectionMock = jest.fn();
  const collectionGroupMock = jest.fn();
  const docMock = jest.fn();

  const usersCreditCardsDocs = [
    { data: () => ({ id: "card-a", deletedAt: null }) },
  ];

  const quotaDocs: MockDoc[] = [
    buildDoc(
      "users/user-a/creditCards/card-a/transactions/tx-a/quotas/q-a",
      {
        id: "q-a",
        amount: 1000,
        currency: "CLP",
        dueDate: "2026-01-10T00:00:00.000Z",
        status: "pending",
        deletedAt: null,
      },
    ),
    buildDoc(
      "users/user-b/creditCards/card-b/transactions/tx-b/quotas/q-b",
      {
        id: "q-b",
        amount: 2000,
        currency: "CLP",
        dueDate: "2026-01-10T00:00:00.000Z",
        status: "pending",
        deletedAt: null,
      },
    ),
  ];

  const txDocs: MockDoc[] = [
    buildDoc(
      "users/user-a/creditCards/card-a/transactions/tx-a",
      {
        id: "tx-a",
        merchant: "Store A",
        amount: 1000,
        currency: "CLP",
        transactionDate: "2026-01-05T00:00:00.000Z",
        deletedAt: null,
      },
    ),
    buildDoc(
      "users/user-b/creditCards/card-b/transactions/tx-b",
      {
        id: "tx-b",
        merchant: "Store B",
        amount: 2000,
        currency: "CLP",
        transactionDate: "2026-01-05T00:00:00.000Z",
        deletedAt: null,
      },
    ),
  ];

  const periodDocs: MockDoc[] = [
    buildDoc(
      "users/user-a/creditCards/card-a/billingPeriods/bp-a",
      {
        id: "bp-a",
        month: "Enero 2026",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-31T23:59:59.999Z",
        deletedAt: null,
      },
    ),
    buildDoc(
      "users/user-b/creditCards/card-b/billingPeriods/bp-b",
      {
        id: "bp-b",
        month: "Enero 2026",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-31T23:59:59.999Z",
        deletedAt: null,
      },
    ),
  ];

  collectionGroupMock.mockImplementation((name: string) => {
    if (name === "quotas") {
      return {
        where: () => ({
          where: () => ({
            get: async () => ({ docs: quotaDocs }),
          }),
        }),
      };
    }

    if (name === "transactions") {
      return {
        where: () => ({
          get: async () => ({ docs: txDocs }),
        }),
      };
    }

    if (name === "billingPeriods") {
      return {
        where: () => ({
          get: async () => ({ docs: periodDocs }),
        }),
      };
    }

    return {
      where: () => ({
        get: async () => ({ docs: [] as MockDoc[] }),
      }),
    };
  });

  docMock.mockImplementation(() => ({
    collection: () => ({
      where: () => ({
        get: async () => ({ docs: usersCreditCardsDocs }),
      }),
    }),
  }));

  collectionMock.mockImplementation((name: string) => {
    if (name === "users") {
      return { doc: docMock };
    }
    return { where: jest.fn() };
  });

  return {
    db: {
      collectionGroup: collectionGroupMock,
      collection: collectionMock,
    },
  };
});

import { DebtForecastService } from "@/modules/quota/debtForecast.service";

describe("DebtForecastService user scoping", () => {
  it("filters collectionGroup results to current user path", async () => {
    const service = new DebtForecastService("user-a");

    const result = await service.getDebtForecast();

    expect(result.totalDebtCLP).toBe(1000);
    expect(result.totalDebtUSD).toBe(0);
    expect(result.months).toHaveLength(1);
    expect(result.months[0].count).toBe(1);
    expect(result.months[0].details[0].transactionId).toBe("tx-a");
    expect(result.months[0].details[0].creditCardId).toBe("card-a");
  });
});
