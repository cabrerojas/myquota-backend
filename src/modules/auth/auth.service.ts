import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { db } from "@/config/firebase";

const GOOGLE_CLIENT_ID =
  "843354250947-or01hgaotco18ounocgpakr6v2usdhkj.apps.googleusercontent.com";

export class AuthService {
  async loginWithGoogle(idToken: string): Promise<string> {
    try {
      // 🔹 Verificar el `idToken` con Google
      const client = new OAuth2Client(GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error("Token inválido");
      }

      const { email, name, picture } = payload;
      console.log("Usuario autenticado:", email);

      // 🔹 Buscar usuario en Firestore
      const usersCollection = db.collection("users");
      const userQuery = await usersCollection
        .where("email", "==", email)
        .limit(1)
        .get();

      let userId: string;
      if (userQuery.empty) {
        console.log("⚠️ Usuario no encontrado, creando uno nuevo...");

        const newUserRef = usersCollection.doc();
        userId = newUserRef.id;

        const newUser = {
          id: userId,
          email,
          name,
          picture,
          createdAt: new Date(),
        };

        await newUserRef.set(newUser);
      } else {
        const userDoc = userQuery.docs[0];
        userId = userDoc.id;
        console.log(`✅ Usuario encontrado: ${userId}`);
      }

      console.log("🔑 Generando token de acceso...");
      console.log(client);

      // 🔹 Generar JWT para el usuario
      const jwtToken = jwt.sign({ userId, email }, process.env.JWT_SECRET!, {
        expiresIn: "7d",
      });

      return jwtToken;
    } catch (error) {
      console.error("Error en loginWithGoogle:", error);
      throw new Error("Error al autenticar con Google");
    }
  }
}
