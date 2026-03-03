import { BaseService } from "@/shared/classes/base.service";
import { CreditCard } from "./creditCard.model";
import { CreditCardRepository } from "./creditCard.repository";
import {
  CacheService,
  CacheTTL,
  CacheKeys,
} from "@/shared/services/cache.service";
import { db } from "@/config/firebase";

export class CreditCardService extends BaseService<CreditCard> {
  // Cambiar el tipo del repository para acceder a los métodos específicos
  protected repository: CreditCardRepository;

  constructor(repository: CreditCardRepository) {
    super(repository);
    // Guardar la referencia al repository tipado
    this.repository = repository;
  }

  /**
   * Counts the total number of uncategorized transactions across all
   * credit cards for the current user.
   *
   * L1: memory (TTL MEDIUM)
   * L2: Firestore summary — users/{userId}/summaries/uncategorizedCount (1 read)
   * L3: full compute — 1 read per credit card (N reads)
   */
  async getUncategorizedCount(userId: string): Promise<number> {
    // L1: memoria
    const cacheKey = CacheKeys.uncategorizedCount(userId);
    const cached = CacheService.get<number>(cacheKey);
    if (cached !== null) return cached;

    // L2: Firestore summary (1 read)
    try {
      const doc = await db
        .collection("users")
        .doc(userId)
        .collection("summaries")
        .doc("uncategorizedCount")
        .get();
      if (doc.exists) {
        const raw = doc.data()!;
        const ageMs = Date.now() - new Date(raw.computedAt as string).getTime();
        if (ageMs < 30 * 60 * 1000) {
          const count = raw.data as number;
          CacheService.set(cacheKey, count, CacheTTL.MEDIUM);
          return count;
        }
      }
    } catch (err) {
      console.error("[uncategorizedCount] L2 read failed:", err);
    }

    // L3: cómputo completo (~N_creditCards reads)
    const creditCards = await this.repository.findAll();
    let count = 0;

    for (const card of creditCards) {
      const txCollection = this.repository.getTransactionsCollection(card.id);
      const snapshot = await txCollection.where("deletedAt", "==", null).get();
      for (const doc of snapshot.docs) {
        if (!doc.data().categoryId) count++;
      }
    }

    CacheService.set(cacheKey, count, CacheTTL.MEDIUM);
    return count;
  }
}
