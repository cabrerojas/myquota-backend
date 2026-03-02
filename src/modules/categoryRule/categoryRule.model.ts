import { IBaseEntity } from "@shared/interfaces/base.repository";

/**
 * A categorization rule that maps merchant patterns to categories.
 *
 * Rules are evaluated by priority (descending) against a transaction's
 * normalized merchant key. If keywords are specified, they must ALL appear
 * in the raw merchant string (AND logic).
 *
 * Path in Firestore: users/{userId}/categoryRules/{ruleId}
 */
export class CategoryRule implements IBaseEntity {
  id!: string;

  /** Owner of this rule */
  userId!: string;

  /** Human-readable name: e.g. "MercadoLibre → Compras Online" */
  name!: string;

  /**
   * Pattern to match against the normalized merchantKey.
   * Simple substring match by default, or use * wildcards.
   * E.g. "mercadolibre", "*farmacia*"
   */
  merchantPattern!: string;

  /**
   * Optional keywords that must ALL appear in the raw merchant string.
   * Useful for marketplace sub-categorization:
   *   merchantPattern: "mercadolibre", keywords: ["botiquín"] → Salud
   */
  keywords?: string[];

  /** Target category ID to assign */
  categoryId!: string;

  /**
   * "suggest" — shows suggestion to user for confirmation
   * "apply"   — auto-categorizes without user confirmation
   */
  action!: "suggest" | "apply";

  /** Higher priority rules are evaluated first (default: 0) */
  priority!: number;

  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;
}
