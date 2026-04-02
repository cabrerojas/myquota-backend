jest.mock("@/config/firebase", () => ({
  db: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            collection: () => ({}),
          }),
        }),
      }),
    }),
  },
}));

import { TransactionRepository } from "@/modules/transaction/transaction.repository";

type MockDoc = {
  ref: {
    path: string;
    parent: { parent: { id: string } | null };
  };
};

describe("TransactionRepository.getCreditCardIdByTransactionId", () => {
  const buildDoc = (path: string, creditCardId: string): MockDoc => ({
    ref: {
      path,
      parent: { parent: { id: creditCardId } },
    },
  });

  it("returns only creditCardId scoped to userId", async () => {
    const repository = new TransactionRepository("user-a", "card-any");
    const docs: MockDoc[] = [
      buildDoc(
        "users/user-b/creditCards/card-b/transactions/tx-1",
        "card-b",
      ),
      buildDoc(
        "users/user-a/creditCards/card-a/transactions/tx-1",
        "card-a",
      ),
    ];

    (
      repository as unknown as {
        repository: {
          firestore: {
            collectionGroup: (
              name: string,
            ) => { where: () => { get: () => Promise<{ empty: boolean; docs: MockDoc[] }> } };
          };
        };
      }
    ).repository = {
      firestore: {
        collectionGroup: (name: string) => {
          expect(name).toBe("transactions");
          return {
            where: () => ({ get: async () => ({ empty: false, docs }) }),
          };
        },
      },
    };

    const creditCardId = await repository.getCreditCardIdByTransactionId(
      "user-a",
      "tx-1",
    );

    expect(creditCardId).toBe("card-a");
  });
});
