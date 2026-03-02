import { FirestoreRepository } from "@shared/classes/firestore.repository";
import { CategoryRule } from "./categoryRule.model";

/**
 * Repository for category rules.
 * Path: users/{userId}/categoryRules
 */
export class CategoryRuleRepository extends FirestoreRepository<CategoryRule> {
  constructor(userId: string) {
    super(["users", userId], "categoryRules");
  }
}
