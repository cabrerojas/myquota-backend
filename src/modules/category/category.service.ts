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
}
