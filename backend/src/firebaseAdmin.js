import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

let db = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔥 Firebase Admin initialized with FIREBASE_SERVICE_ACCOUNT environment variable');
  } else if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔥 Firebase Admin initialized with serviceAccountKey.json');
  } else {
    // Try environment variable or default initialization
    admin.initializeApp();
    console.log('🔥 Firebase Admin initialized with default credentials');
  }
  db = admin.firestore();
} catch (error) {
  console.warn('⚠️ Firebase Admin failed to initialize. Running in local mock mode.', error.message);
  console.warn('👉 To resolve this, place serviceAccountKey.json in the backend/ folder.');
}

export { admin, db };
