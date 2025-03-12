import { FirestoreRepository } from "@/shared/classes/firestore.repository";
import { BillingPeriod } from "./billingPeriod.model";

export class BillingPeriodRepository extends FirestoreRepository<BillingPeriod> {
  constructor(userId: string, creditCardId: string) {
    super(["users", userId, "creditCards", creditCardId], "billingPeriods");
  }

  async findAll(): Promise<BillingPeriod[]> {
    try {
      const snapshot = await this.repository
        .orderBy("startDate", "desc") // 🔹 Ordenar por fecha de inicio en orden descendente
        .get();

      return snapshot.docs.map((doc) => doc.data() as BillingPeriod);
    } catch (error) {
      console.error("❌ Error al obtener los BillingPeriods ordenados:", error);
      throw new Error("Error al obtener los períodos de facturación.");
    }
  }
}
