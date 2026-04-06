import { FirestoreRepository } from "@/shared/classes/firestore.repository";
import { Category } from "./category.model";

export class CategoryRepository extends FirestoreRepository<Category> {
  constructor(userId?: string) {
    // Si userId está presente, es una categoría de usuario, si no, global
    super(userId ? ["users", userId] : [], "categories");
  }
}
