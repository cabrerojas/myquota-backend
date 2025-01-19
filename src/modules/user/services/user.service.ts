import { UserRepository } from "../repositories/user.repository";
import { User } from "../models/user.model";
import { BaseService } from "@/shared/classes/base.service";

export class UserService extends BaseService<User> {
  protected repository: UserRepository;

  constructor(repository : UserRepository) {
    super(repository);
    this.repository = new UserRepository();
  }

  // Crear un usuario
  async createUser(email: string, name: string): Promise<User> {
    const user: User = {
      id: "",
      email,
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    return this.repository.create(user);
  }

  // Obtener usuario por ID
  async getUserById(userId: string): Promise<User | null> {
    return this.repository.findById(userId);
  }

  // Obtener usuario por correo electrónico
  async getUserByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ email });
  }

  // Actualizar usuario
  async updateUser(userId: string, data: Partial<User>): Promise<User | null> {
    return this.repository.update(userId, data);
  }

  // Eliminar usuario (soft delete)
  async deleteUser(userId: string): Promise<boolean> {
    return this.repository.softDelete(userId);
  }
}
