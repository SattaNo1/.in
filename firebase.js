// Firebase Configuration — Satta No.1
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, onSnapshot, increment, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBklYTB9FOP13g-jKSUR7OSaRT4RLazw_Y",
  authDomain: "satta-28662.firebaseapp.com",
  projectId: "satta-28662",
  storageBucket: "satta-28662.firebasestorage.app",
  messagingSenderId: "930874157007",
  appId: "1:930874157007:web:f48410bce16c0f522e54ba",
  measurementId: "G-X2599ZJZ1Z"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Export all needed Firebase functions + instances
export {
  app, auth, db, googleProvider,
  GoogleAuthProvider, signInWithPopup, fbSignOut, onAuthStateChanged,
  doc, getDoc, setDoc, addDoc, updateDoc, collection,
  query, where, orderBy, limit, getDocs, onSnapshot,
  increment, serverTimestamp, Timestamp
};
