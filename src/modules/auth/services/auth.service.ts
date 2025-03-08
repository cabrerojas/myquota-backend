import { db } from "@/config/firebase";
import jwt from "jsonwebtoken";
import {
  authenticate,
  saveTokenToFirestore,
} from "@/config/gmailAuth";
import { google } from "googleapis";

export class AuthService {
  async loginWithGoogle(): Promise<string> {
    // 🔹 Autenticar con Gmail y obtener el cliente de autenticación
    const authClient = await authenticate();

    if (!authClient.credentials.access_token) {
      throw new Error("No se pudo obtener el access_token de Google.");
    }

    const oauth2 = google.oauth2({ version: "v2", auth: authClient });

    // 🔹 Obtener información del usuario (email)
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      throw new Error("No se pudo obtener el email del usuario.");
    }

    const userId = email; // 🔥 Usamos el email como ID del usuario
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      // 📌 Si el usuario no existe, crearlo
      const newUser = {
        id: userId,
        email: email,
        name: email.split("@")[0], // Usamos el prefijo del correo como nombre
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.collection("users").doc(userId).set(newUser);
    }

    // 📌 Guardar `emailToken` en Firestore

    await saveTokenToFirestore(userId, {
      access_token: authClient.credentials.access_token,
      refresh_token: authClient.credentials.refresh_token || null,
      expiry_date:
        authClient.credentials.expiry_date ||
        new Date().getTime() + 3600 * 1000,
    });
    

    // 📌 Generar JWT con el `userId`
    const token = this.generateJWT(userId);
    return token;
  }

  private generateJWT(userId: string): string {
    return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
  }
}
