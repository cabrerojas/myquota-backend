import { MerchantPattern } from "./merchant.model";
import { db } from "@/config/firebase";

export class MerchantPatternRepository {
  constructor(private readonly categoryId: string) {}

  getCollection() {
    return db
      .collection("categories")
      .doc(this.categoryId)
      .collection("merchants");
  }

  async addPattern(
    pattern: Omit<MerchantPattern, "id" | "createdAt">,
  ): Promise<MerchantPattern> {
    const now = new Date();
    const docRef = await this.getCollection().add({
      ...pattern,
      createdAt: now,
    });
    return { id: docRef.id, ...pattern, createdAt: now };
  }

  async findMatchingPattern(
    merchantName: string,
  ): Promise<MerchantPattern | null> {
    const snapshot = await this.getCollection().get();
    for (const doc of snapshot.docs) {
      const data = doc.data() as MerchantPattern;
      if (merchantName.toUpperCase().includes(data.pattern.toUpperCase())) {
        return { ...data };
      }
    }
    return null;
  }

  async getAllPatterns(): Promise<MerchantPattern[]> {
    const snapshot = await this.getCollection().get();
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as MerchantPattern,
    );
  }
}
