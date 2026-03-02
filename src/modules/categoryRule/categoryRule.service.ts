import { BaseService } from "@shared/classes/base.service";
import { IBaseEntity } from "@shared/interfaces/base.repository";
import { CategoryRule } from "./categoryRule.model";
import { CategoryRuleRepository } from "./categoryRule.repository";
import { CategoryService } from "@modules/category/category.service";
import {
  normalizeMerchant,
  matchesMerchantPattern,
  matchesKeywords,
  MerchantNormalization,
} from "@shared/utils/merchant.utils";

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  categoryIcon?: string;
  categoryColor?: string;
  ruleId: string | null;
  ruleName: string | null;
  method: "rule" | "pattern" | "none";
  confidence: number;
  merchantNormalized: MerchantNormalization;
}

export class CategoryRuleService extends BaseService<CategoryRule> {
  protected repository: CategoryRuleRepository;

  constructor(
    repository: CategoryRuleRepository,
    private readonly categoryService: CategoryService,
  ) {
    super(repository);
    this.repository = repository;
  }

  /**
   * Creates a new rule with validation.
   */
  async createRule(
    data: Omit<CategoryRule, keyof IBaseEntity>,
  ): Promise<CategoryRule> {
    if (!data.name || !data.name.trim()) {
      throw new Error("El nombre de la regla es requerido");
    }
    if (!data.merchantPattern || !data.merchantPattern.trim()) {
      throw new Error("El patrón de comercio es requerido");
    }
    if (!data.categoryId) {
      throw new Error("La categoría destino es requerida");
    }
    if (!data.action || !["suggest", "apply"].includes(data.action)) {
      throw new Error("La acción debe ser 'suggest' o 'apply'");
    }

    return this.repository.create({
      ...data,
      priority: data.priority ?? 0,
      keywords: data.keywords ?? [],
    });
  }

  /**
   * Returns all rules sorted by priority descending.
   */
  async getRulesSorted(): Promise<CategoryRule[]> {
    const rules = await this.repository.findAll();
    return rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Evaluates all rules against a transaction's merchant string.
   * Returns the best matching suggestion, or falls back to MerchantPattern.
   */
  async getSuggestion(merchantRaw: string): Promise<CategorySuggestion> {
    const normalized = normalizeMerchant(merchantRaw);
    const rules = await this.getRulesSorted();

    // 1. Evaluate user rules by priority
    for (const rule of rules) {
      const patternMatches = matchesMerchantPattern(
        normalized.merchantKey,
        rule.merchantPattern,
      );
      if (!patternMatches) continue;

      const keywordsMatch = matchesKeywords(merchantRaw, rule.keywords ?? []);
      if (!keywordsMatch) continue;

      // Rule matches — resolve category details
      const categories = await this.categoryService.getAllCategories();
      const cat = categories.find((c) => c.id === rule.categoryId);

      return {
        categoryId: rule.categoryId,
        categoryName: cat?.name ?? "Categoría desconocida",
        categoryIcon: cat?.icon,
        categoryColor: cat?.color,
        ruleId: rule.id,
        ruleName: rule.name,
        method: "rule",
        confidence: 0.9,
        merchantNormalized: normalized,
      };
    }

    // 2. Fallback: try existing MerchantPattern system
    const patternMatch =
      await this.categoryService.findCategoryByMerchant(merchantRaw);
    if (patternMatch) {
      const categories = await this.categoryService.getAllCategories();
      const cat = categories.find((c) => c.id === patternMatch.categoryId);

      return {
        categoryId: patternMatch.categoryId,
        categoryName: patternMatch.categoryName,
        categoryIcon: cat?.icon,
        categoryColor: cat?.color,
        ruleId: null,
        ruleName: null,
        method: "pattern",
        confidence: 0.75,
        merchantNormalized: normalized,
      };
    }

    // 3. No match
    return {
      categoryId: "",
      categoryName: "",
      ruleId: null,
      ruleName: null,
      method: "none",
      confidence: 0,
      merchantNormalized: normalized,
    };
  }
}
