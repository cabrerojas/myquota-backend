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
    // Evitar duplicados: buscar patrones iguales (case-insensitive) antes de crear
    const existingSnapshot = await this.getCollection().get();
    for (const doc of existingSnapshot.docs) {
      const data = doc.data() as MerchantPattern;
      if (
        data.pattern &&
        data.pattern.toLowerCase() === pattern.pattern.toLowerCase()
      ) {
        return { ...data } as MerchantPattern;
      }
    }

    const now = new Date();
    const docRef = await this.getCollection().add({
      ...pattern,
      createdAt: now,
    });
    return { id: docRef.id, ...pattern, createdAt: now } as MerchantPattern;
  }

  async findMatchingPattern(
    merchantName: string,
  ): Promise<MerchantPattern | null> {
    const snapshot = await this.getCollection().get();
    for (const doc of snapshot.docs) {
      const data = doc.data() as MerchantPattern;
      if (merchantName.toUpperCase().includes(data.pattern.toUpperCase())) {
        return {
          id: doc.id,
          name: data.name,
          pattern: data.pattern,
          createdBy: data.createdBy,
          createdAt: data.createdAt,
        } as MerchantPattern;
      }
    }
    return null;
  }

  async getAllPatterns(): Promise<MerchantPattern[]> {
    const snapshot = await this.getCollection().get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() as Partial<MerchantPattern>;
      const { name, pattern, createdBy, createdAt } = data;
      return {
        id: doc.id,
        name: name || "",
        pattern: pattern || "",
        createdBy: createdBy || "",
        createdAt: createdAt || new Date(),
      } as MerchantPattern;
    });
  }
}
