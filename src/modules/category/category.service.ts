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
}
