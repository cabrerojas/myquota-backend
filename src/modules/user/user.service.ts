import { UserRepository } from "./user.repository";
import { User } from "./user.model";
import { BaseService } from "@/shared/classes/base.service";

export class UserService extends BaseService<User> {
  constructor(protected repository: UserRepository) {
    super(repository);
  }

  // Crear un usuario asegurando que el email sea único
  async createUser(email: string, name: string): Promise<User> {
    const existingUser = await this.repository.findOne({ email });

    if (existingUser) {
      throw new Error(`Ya existe un usuario con el email: ${email}`);
    }

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
