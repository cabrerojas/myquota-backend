import { MerchantPatternService } from "./merchant/merchant.service";
import { BaseService } from "@/shared/classes/base.service";
import { Category } from "./category.model";
import { CategoryRepository } from "./category.repository";
import { CreditCardRepository } from "@/modules/creditCard/creditCard.repository";

export class CategoryService extends BaseService<Category> {
  private globalRepository: CategoryRepository;
  private userRepository?: CategoryRepository;

  constructor(userId?: string) {
    super(new CategoryRepository(userId));
    this.globalRepository = new CategoryRepository();
    if (userId) {
      this.userRepository = new CategoryRepository(userId);
    }
  }

  async getAllCategories(): Promise<Category[]> {
    const [global, user] = await Promise.all([
      this.globalRepository.findAll(),
      this.userRepository ? this.userRepository.findAll() : Promise.resolve([]),
    ]);
    return [...global, ...user];
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

    // Si se indicó un merchant/pattern y tenemos userId, asociarlo y propagar a transacciones
    if (category && merchantName && pattern && userId) {
      await this.addMerchantPatternToCategory(
        category.id,
        merchantName,
        pattern,
        userId,
      );

      try {
        // Propagar categoryId a transacciones existentes del usuario con el mismo merchant
        const creditCardRepo = new CreditCardRepository(userId);
        const creditCards = await creditCardRepo.findAll();
        for (const cc of creditCards) {
          const txCollection = creditCardRepo.getTransactionsCollection(cc.id);
          const snapshot = await txCollection
            .where("merchant", "==", merchantName)
            .where("deletedAt", "==", null)
            .get();
          if (!snapshot.empty) {
            const batch = creditCardRepo.repository.firestore.batch();
            snapshot.docs.forEach((doc) => {
              batch.update(doc.ref, {
                categoryId: category.id,
                updatedAt: new Date().toISOString(),
              });
            });
            await batch.commit();
          }
        }
      } catch (e) {
        console.warn(
          "Could not propagate category to existing transactions:",
          e,
        );
      }
    }

    return category;
  }
}
