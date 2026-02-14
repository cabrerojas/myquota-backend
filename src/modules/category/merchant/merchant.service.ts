import { MerchantPattern } from "./merchant.model";
import { MerchantPatternRepository } from "./merchant.repository";

export class MerchantPatternService {
  private repository: MerchantPatternRepository;

  constructor(categoryId: string) {
    this.repository = new MerchantPatternRepository(categoryId);
  }

  async addPattern(pattern: Omit<MerchantPattern, "id" | "createdAt">) {
    return this.repository.addPattern(pattern);
  }

  async findMatchingPattern(merchantName: string) {
    return this.repository.findMatchingPattern(merchantName);
  }

  async getAllPatterns() {
    return this.repository.getAllPatterns();
  }
}
