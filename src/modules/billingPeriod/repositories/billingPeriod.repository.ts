import { FirestoreRepository } from "@/shared/classes/firestore.repository";
import { BillingPeriod } from "../models/billingPeriod.model";

export class BillingPeriodRepository extends FirestoreRepository<BillingPeriod> {
  constructor(userId: string, creditCardId: string) {
    super(["users", userId, "creditCards", creditCardId], "billingPeriods");
  }
}
