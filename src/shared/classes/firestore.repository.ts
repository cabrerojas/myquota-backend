// src/shared/classes/firestore.repository.ts
import { Timestamp } from '@google-cloud/firestore';
import { RepositoryError } from '../errors/custom.error';
import { IBaseEntity, IBaseRepository } from '../interfaces/base.repository';
import { db } from '@/config/firebase';

export class FirestoreRepository<T extends IBaseEntity> implements IBaseRepository<T> {
  public repository: FirebaseFirestore.CollectionReference<T>;

  /**
   * Convierte Firestore Timestamps a Date nativas para que
   * JSON.stringify() los serialice como ISO strings.
   */
  protected sanitizeTimestamps(data: T): T {
    const sanitized = { ...data };
    for (const [key, value] of Object.entries(sanitized)) {
      if (value instanceof Timestamp) {
        (sanitized as Record<string, unknown>)[key] = value.toDate();
      }
    }
    return sanitized;
  }

  constructor(path: string[], collectionName: string) {
    if (!collectionName) {
      throw new Error("❌ Collection name is required");
    }

    console.log("📌 Path recibido:", path);
    console.log("📌 Collection Name recibido:", collectionName);

    if (!path.length) {
      console.warn(
        "⚠️ No se recibió un path, inicializando colección raíz:",
        collectionName
      );
      this.repository = db.collection(
        collectionName
      ) as FirebaseFirestore.CollectionReference<T>;
    } else {
      let ref:
        | FirebaseFirestore.DocumentReference
        | FirebaseFirestore.CollectionReference = db
        .collection(path[0])
        .doc(path[1]);

      // 🔹 Si hay más niveles en el path, construimos la referencia a subcolecciones
      for (let i = 2; i < path.length; i += 2) {
        if (!path[i + 1]) {
          console.error(
            `❌ Error: El path está incompleto en la posición ${i}`
          );
          throw new Error(
            `❌ Error en el path: Se esperaba otro segmento después de ${path[i]}`
          );
        }
        ref = ref.collection(path[i]).doc(path[i + 1]);
      }

      // 🔹 La colección final es `collectionName` dentro del documento
      console.log("✅ Documento Referencia Final:", ref.path);
      this.repository = ref.collection(
        collectionName
      ) as FirebaseFirestore.CollectionReference<T>;
    }
  }

  async create(
    data: Omit<T, keyof IBaseEntity> & Partial<IBaseEntity>
  ): Promise<T> {
    if (!data) {
      throw new RepositoryError("Data to create entity is required", 400);
    }

    const now = new Date();
    const id = data.id || this.repository.doc().id; // Usa data.id si existe, de lo contrario genera un nuevo ID
    const entity: T = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as T; // Asegúrate de forzar el tipo correctamente

    try {
      await this.repository.doc(id).set(entity);
      return entity;
    } catch (error) {
      console.error("Error in FirestoreRepository.create:", error);
      throw new RepositoryError("Error creating entity", 500);
    }
  }

  async findAll(filters?: Partial<T>): Promise<T[]> {
    try {
      let query: FirebaseFirestore.Query<T> = this.repository.where(
        "deletedAt",
        "==",
        null
      );

      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          query = query.where(key as string, "==", value);
        });
      }

      const snapshot = await query.get();
      return snapshot.docs.map((doc) => this.sanitizeTimestamps(doc.data()));
    } catch (error) {
      console.error("Error in FirestoreRepository.findAll:", error);
      throw new RepositoryError(`Error finding entities: ${error}`, 500);
    }
  }

  async findById(id: string): Promise<T | null> {
    try {
      if (!id) {
        throw new Error("❌ El ID proporcionado es inválido.");
      }

      console.log(
        "📌 Buscando en la colección:",
        this.repository.path,
        "ID:",
        id
      );

      const docRef = this.repository.doc(id);
      console.log("📌 Documento Referencia Final:", docRef.path);

      const doc = await docRef.get();

      if (!doc.exists || doc.data()?.deletedAt) {
        console.warn(`⚠️ Documento con ID ${id} no encontrado o eliminado.`);
        return null;
      }

      return this.sanitizeTimestamps(doc.data() as T);
    } catch (error) {
      console.error("❌ Error en FirestoreRepository.findById:", error);
      throw new RepositoryError("Error find entity by id", 500);
    }
  }

  async findOne(filters: Partial<T>): Promise<T | null> {
    try {
      let query: FirebaseFirestore.Query<T> = this.repository.where(
        "deletedAt",
        "==",
        null
      );

      Object.entries(filters).forEach(([key, value]) => {
        query = query.where(key as string, "==", value);
      });

      const snapshot = await query.limit(1).get();
      if (snapshot.empty) {
        return null;
      }
      return this.sanitizeTimestamps(snapshot.docs[0].data());
    } catch (error) {
      console.error("Error in FirestoreRepository.findOne:", error);
      throw new RepositoryError("Error finding one entity", 500);
    }
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    if (!id || !data) {
      throw new RepositoryError("ID and data to update are required", 400);
    }

    const entity = await this.findById(id);
    if (!entity) {
      throw new RepositoryError(`Entity with ID ${id} not found`, 404);
    }

    Object.assign(entity, {
      ...data,
      updatedAt: new Date(),
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.repository.doc(id).update({ ...entity } as any);
      return entity;
    } catch (error) {
      console.error("Error in FirestoreRepository.update:", error);
      throw new RepositoryError("Error updating entity", 500);
    }
  }
  async delete(id: string): Promise<boolean> {
    try {
      const entity = await this.findById(id);
      if (!entity) return false;

      await this.repository.doc(id).delete();
      return true;
    } catch (error) {
      console.error("Error in FirestoreRepository.delete:", error);
      throw new RepositoryError("Error deleting entity", 500);
    }
  }

  async softDelete(id: string): Promise<boolean> {
    try {
      const entity = await this.findById(id);
      if (!entity) return false;

      entity.deletedAt = new Date();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.repository.doc(id).update({ ...entity } as any);
      return true;
    } catch (error) {
      console.error("Error in FirestoreRepository.softDelete:", error);
      throw new RepositoryError("Error soft deleting entity", 500);
    }
  }
}