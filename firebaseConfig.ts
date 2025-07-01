// File: firebaseConfig.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD1YE6PuqYVmvbqQTh4M5fU3hjDfpsQNKE",
  authDomain: "switchcx-42740.firebaseapp.com",
  projectId: "switchcx-42740",
  storageBucket: "switchcx-42740.firebasestorage.app",
  messagingSenderId: "192618291824",
  appId: "1:192618291824:web:f429f63c8490da569d4ab5",
  measurementId: "G-61YCTMY3CG"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
