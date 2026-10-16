import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyBLS4BUmdmGTuwpAy_jSzYAJpyScScYY6Q",
    authDomain: "brasiinha.firebaseapp.com",
    projectId: "brasiinha",
    storageBucket: "brasiinha.firebasestorage.app",
    messagingSenderId: "350909634462",
    appId: "1:350909634462:web:c984f2001ac82fe21de88f"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
