import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Default config placeholder.
// The user can replace this with their actual Firebase config.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

let app = null;
let db = null;
let auth = null;
let isMock = false;

// Determine if we should run in Mock Mode (either placeholder keys or initialization fail)
try {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId;

  if (!apiKey || apiKey.includes('YOUR_') || apiKey === 'YOUR_API_KEY_HERE') {
    isMock = true;
    console.warn('⚠️ running in LOCAL STORAGE MOCK MODE. Firebase keys not configured.');
    console.warn('👉 To use real Firestore, update frontend/src/firebase.js with your project credentials.');
  } else {
    const config = {
      apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
    };
    app = initializeApp(config);
    db = getFirestore(app);
    auth = getAuth(app);
    console.log('🔥 Firebase initialized successfully!');
  }
} catch (error) {
  console.error('Firebase failed to initialize, falling back to mock mode:', error);
  isMock = true;
}

export { db, auth, isMock };
export default db;
