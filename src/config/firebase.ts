import admin from "firebase-admin";
import { getEnv } from "@config/env.validation";

const env = getEnv();

const serviceAccountJson = Buffer.from(
  env.SERVICE_ACCOUNT_KEY,
  "base64",
).toString("utf8");
const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: env.FIREBASE_DB_URL,
});

// Inicializar Firestore y Fireorm
const db = admin.firestore();

export { db };
