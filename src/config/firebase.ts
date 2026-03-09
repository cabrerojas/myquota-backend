import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

// Configuración de Firebase
//const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

const serviceAccountJson = Buffer.from(
  process.env.SERVICE_ACCOUNT_KEY!,
  "base64",
).toString("utf8");
const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL,
});

// Inicializar Firestore y Fireorm
const db = admin.firestore();

export { db };
