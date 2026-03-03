import { MerchantPatternService } from "./merchant/merchant.service";
import { BaseService } from "@/shared/classes/base.service";
import { Category } from "./category.model";
import { CategoryRepository } from "./category.repository";
import { CreditCardRepository } from "@/modules/creditCard/creditCard.repository";
import {
  CacheService,
  CacheTTL,
  CacheKeys,
} from "@/shared/services/cache.service";

export class CategoryService extends BaseService<Category> {
  private globalRepository: CategoryRepository;
  private userRepository?: CategoryRepository;
  private userId?: string;

  constructor(userId?: string) {
    super(new CategoryRepository(userId));
    this.globalRepository = new CategoryRepository();
    this.userId = userId;
    if (userId) {
      this.userRepository = new CategoryRepository(userId);
    }
  }

  async getAllCategories(options?: {
    deduplicate?: boolean;
  }): Promise<Category[]> {
    const dedup = options?.deduplicate ? ":dedup" : "";
    const cacheKey = this.userId
      ? `${CacheKeys.userCategories(this.userId)}${dedup}`
      : `${CacheKeys.globalCategories()}${dedup}`;

    const cached = CacheService.get<Category[]>(cacheKey);
    if (cached !== null) return cached;

    const [global, user] = await Promise.all([
      this.globalRepository.findAll(),
      this.userRepository ? this.userRepository.findAll() : Promise.resolve([]),
    ]);

    const all = [...global, ...user];

    if (!options?.deduplicate) {
      CacheService.set(cacheKey, all, CacheTTL.LONG);
      return all;
    }

    // Deduplicate by normalizedName — personal categories take priority
    const seen = new Map<string, Category>();
    for (const cat of user) {
      const key = cat.normalizedName ?? cat.name.trim().toLowerCase();
      seen.set(key, cat);
    }
    for (const cat of global) {
      const key = cat.normalizedName ?? cat.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, cat);
      }
    }
    const deduplicated = Array.from(seen.values());
    CacheService.set(cacheKey, deduplicated, CacheTTL.LONG);
    return deduplicated;
  }

  /**
   * Registra un patrón de comercio en la categoría global
   */
  async addMerchantPatternToCategory(
    categoryId: string,
    merchantName: string,
    pattern: string,
    userId: string,
  ) {
    const merchantService = new MerchantPatternService(categoryId);
    return merchantService.addPattern({
      name: merchantName,
      pattern,
      createdBy: userId,
    });
  }

  /**
   * Busca un match automático de categoría para un nombre de comercio
   */
  async findCategoryByMerchant(
    merchantName: string,
  ): Promise<{ categoryId: string; categoryName: string } | null> {
    const categories = await this.globalRepository.findAll();
    for (const category of categories) {
      const merchantService = new MerchantPatternService(category.id);
      const match = await merchantService.findMatchingPattern(merchantName);
      if (match) {
        return { categoryId: category.id, categoryName: category.name };
      }
    }
    return null;
  }

  /**
   * Copia una categoría global a las categorías personales de un usuario
   */
  async addGlobalCategoryToUser(
    categoryId: string,
    userId: string,
  ): Promise<Category> {
    const category = await this.globalRepository.findById(categoryId);
    if (!category) {
      throw new Error("Categoría global no encontrada");
    }

    const userRepo = new CategoryRepository(userId);
    const created = await userRepo.create({
      name: category.name,
      color: category.color,
      icon: category.icon,
      normalizedName:
        category.normalizedName ??
        (category.name ? category.name.trim().toLowerCase() : undefined),
      userId,
    } as Omit<
      Category,
      keyof import("@/shared/interfaces/base.repository").IBaseEntity
    >);

    return created;
  }

  /**
   * Crea una categoría global o personal y asocia el comercio si se provee
   */
  async createCategoryWithMerchant({
    name,
    color,
    icon,
    isGlobal,
    merchantName,
    pattern,
    userId,
  }: {
    name: string;
    color?: string;
    icon?: string;
    isGlobal?: boolean;
    merchantName?: string;
    pattern?: string;
    userId?: string;
  }) {
    if (!name) throw new Error("El nombre de la categoría es requerido");
    const normalizeName = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
    const normalized = normalizeName(name);
    let category;
    // Buscar categoría existente por nombre normalizado (global o personal según isGlobal)
    if (isGlobal) {
      category = await this.globalRepository.findOne({
        normalizedName: normalized,
      });
      if (!category) {
        category = await this.globalRepository.create({
          name,
          color,
          icon,
          normalizedName: normalized,
        });
      }
    } else {
      if (!userId) throw new Error("userId requerido para categoría personal");
      category = await this.userRepository?.findOne({
        normalizedName: normalized,
      });
      if (!category) {
        category = await this.userRepository?.create({
          name,
          color,
          icon,
          userId,
          normalizedName: normalized,
        });
      }
    }

    // Si se indicó un merchant/pattern y tenemos userId, asociarlo a la categoría
    if (category && merchantName && pattern && userId) {
      await this.addMerchantPatternToCategory(
        category.id,
        merchantName,
        pattern,
        userId,
      );
    }

    return category;
  }

  /**
   * Registers a merchant→category mapping in the global registry so that
   * future imports auto-suggest this category for the same merchant.
   *
   * - If `categoryId` is a global category, the pattern is registered directly.
   * - If `categoryId` is a personal category, the corresponding global
   *   category (by normalizedName) is used instead.
   * - If no global equivalent exists, the registration is skipped silently.
   */
  async registerMerchantMapping(
    categoryId: string,
    merchantName: string,
    userId: string,
  ): Promise<void> {
    // Check global category first
    const globalCat = await this.globalRepository.findById(categoryId);
    if (globalCat) {
      await this.addMerchantPatternToCategory(
        globalCat.id,
        merchantName,
        merchantName,
        userId,
      );
      return;
    }

    // It's a personal category — find the global equivalent by normalizedName
    if (this.userRepository) {
      const personalCat = await this.userRepository.findById(categoryId);
      if (personalCat?.normalizedName) {
        const globalEquivalent = await this.globalRepository.findOne({
          normalizedName: personalCat.normalizedName,
        });
        if (globalEquivalent) {
          await this.addMerchantPatternToCategory(
            globalEquivalent.id,
            merchantName,
            merchantName,
            userId,
          );
        }
      }
    }
  }

  /**
   * Returns the distinct categories that have been assigned to transactions
   * matching a given merchant name across all the user's credit cards.
   * This powers the "previously used categories" suggestion UI.
   */
  async getMerchantCategoryHistory(
    userId: string,
    merchantName: string,
  ): Promise<Array<{ categoryId: string; count: number }>> {
    const creditCardRepo = new CreditCardRepository(userId);
    const creditCards = await creditCardRepo.findAll();
    const categoryCount = new Map<string, number>();

    const normalizedMerchant = merchantName.trim().toUpperCase();

    for (const cc of creditCards) {
      const txCollection = creditCardRepo.getTransactionsCollection(cc.id);
      const snapshot = await txCollection.where("deletedAt", "==", null).get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (
          data.categoryId &&
          data.merchant &&
          data.merchant.trim().toUpperCase() === normalizedMerchant
        ) {
          const prev = categoryCount.get(data.categoryId) ?? 0;
          categoryCount.set(data.categoryId, prev + 1);
        }
      }
    }

    return Array.from(categoryCount.entries())
      .map(([categoryId, count]) => ({ categoryId, count }))
      .sort((a, b) => b.count - a.count);
  }
}
