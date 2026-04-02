import { EmailImportService } from "@/modules/transaction/emailImport.service";

function buildGoogleApisMock() {
  const listMock = jest.fn();
  const getMock = jest.fn();
  const gmailFactoryMock = jest.fn(() => ({
    users: {
      messages: {
        list: listMock,
        get: getMock,
      },
    },
  }));

  (globalThis as { __gmailMocks?: unknown }).__gmailMocks = {
    listMock,
    getMock,
    gmailFactoryMock,
  };

  return {
    google: {
      auth: {
        OAuth2: class {
          setCredentials = jest.fn();
          refreshAccessToken = jest.fn();
        },
      },
      gmail: gmailFactoryMock,
    },
  };
}

jest.mock("googleapis", () => buildGoogleApisMock());

const { listMock, getMock } = (globalThis as unknown as {
  __gmailMocks: {
    listMock: jest.Mock;
    getMock: jest.Mock;
    gmailFactoryMock: jest.Mock;
  };
}).__gmailMocks;

jest.mock("@config/gmailAuth", () => ({
  getTokenFromFirestore: jest.fn().mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiryDate: Date.now() + 60_000,
  }),
}));

jest.mock("@config/env.validation", () => ({
  getEnv: () => ({
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
  }),
}));

const addIfAbsentByCollection = new Map<string, Set<string>>();

jest.mock("@/modules/transaction/transaction.repository", () => ({
  TransactionRepository: class {
    private readonly key: string;

    constructor(userId: string, creditCardId: string) {
      this.key = `${userId}:${creditCardId}`;
    }

    async addIfAbsent(transaction: { id: string }): Promise<boolean> {
      const existing = addIfAbsentByCollection.get(this.key) ?? new Set<string>();
      const alreadyExists = existing.has(transaction.id);
      existing.add(transaction.id);
      addIfAbsentByCollection.set(this.key, existing);
      return !alreadyExists;
    }
  },
}));

class InMemoryCreditCardRepository {
  private readonly cards = [
    {
      id: "cc-1",
      cardLastDigits: "1234",
    },
  ];

  async findAll() {
    return this.cards;
  }
}

const categoryServiceStub = {
  async buildMerchantCategoryMapAsync() {
    return new Map<string, { categoryId: string; categoryName: string }>();
  },
};

const buildHtml = (merchant: string): string =>
  `<html><body><table><tr><td>Se registró una compra por $12.345 en ${merchant} el 01/02/2026 10:30 con tu Tarjeta de Crédito ****1234</td></tr></table></body></html>`;

const encodePayload = (html: string): string =>
  Buffer.from(html, "utf8").toString("base64");

describe("EmailImportService.fetchBankEmails deduplication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    addIfAbsentByCollection.clear();
  });

  it("deduplicates repeated imports using deterministic identity", async () => {
    listMock.mockResolvedValue({
      data: {
        messages: [{ id: "m-1" }, { id: "m-2" }],
      },
    });

    getMock.mockResolvedValue({
      data: {
        payload: {
          mimeType: "text/html",
          body: {
            data: encodePayload(buildHtml("SUPERMERCADO UNO")),
          },
        },
      },
    });

    const service = new EmailImportService();
    const repository = new InMemoryCreditCardRepository();

    const firstRun = await service.fetchBankEmails(
      "user-1",
      repository as never,
      categoryServiceStub,
    );
    const secondRun = await service.fetchBankEmails(
      "user-1",
      repository as never,
      categoryServiceStub,
    );

    expect(firstRun.importedCount).toBe(1);
    expect(secondRun.importedCount).toBe(0);
    expect(addIfAbsentByCollection.get("user-1:cc-1")?.size).toBe(1);
  });

  it("avoids duplicates under concurrent import runs", async () => {
    listMock.mockResolvedValue({
      data: {
        messages: [{ id: "m-1" }],
      },
    });

    getMock.mockResolvedValue({
      data: {
        payload: {
          mimeType: "text/html",
          body: {
            data: encodePayload(buildHtml("FARMACIA DOS")),
          },
        },
      },
    });

    const service = new EmailImportService();
    const repository = new InMemoryCreditCardRepository();

    const [runA, runB, runC] = await Promise.all([
      service.fetchBankEmails("user-1", repository as never, categoryServiceStub),
      service.fetchBankEmails("user-1", repository as never, categoryServiceStub),
      service.fetchBankEmails("user-1", repository as never, categoryServiceStub),
    ]);

    expect(runA.importedCount + runB.importedCount + runC.importedCount).toBe(1);
    expect(addIfAbsentByCollection.get("user-1:cc-1")?.size).toBe(1);
  });
});
