
import { FirestoreRepository } from "@/shared/classes/firestore.repository";
import { User } from "../models/user.model";

export class UserRepository extends FirestoreRepository<User> {
  constructor() {
    super([], "users"); // Se accede a la colección "users" de nivel 1
  }
}