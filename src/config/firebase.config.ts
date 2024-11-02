import * as admin from 'firebase-admin';
import { initialize } from 'fireorm';

export const initializeFirebase = () => {
    // Inicializa Firebase Admin
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        // otras configuraciones...
    });

    // Inicializa FireORM
    const firestore = admin.firestore();
    initialize(firestore);
};
