import admin from 'firebase-admin';
import * as fireorm from 'fireorm';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// Configuración de Firebase
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DB_URL,
});

// Inicializar Firestore y Fireorm
const db = admin.firestore();
fireorm.initialize(db);

export { db };