import { MerchantPatternService } from "./merchant/merchant.service";
import { BaseService } from "@/shared/classes/base.service";
import { Category } from "./category.model";
import { CategoryRepository } from "./category.repository";

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
  async addGlobalCategoryToUser(categoryId: string, userId: string): Promise<Category> {
    const category = await this.globalRepository.findById(categoryId);
    if (!category) {
      throw new Error("Categoría global no encontrada");
    }

    const userRepo = new CategoryRepository(userId);
    const created = await userRepo.create({
      name: category.name,
      color: category.color,
      icon: category.icon,
      userId,
    } as Omit<Category, keyof import("@/shared/interfaces/base.repository").IBaseEntity>);

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
    let category;
    if (isGlobal) {
      category = await this.globalRepository.create({ name, color, icon });
    } else {
      if (!userId) throw new Error("userId requerido para categoría personal");
      category = await this.userRepository?.create({ name, color, icon });
    }
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
}
