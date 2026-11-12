/**
 * firebase.js — Inicialização exclusiva do Firebase Auth no cliente.
 * NENHUM acesso ao Firestore (firebase/firestore) é feito no Front-end.
 * Toda leitura/escrita de dados passa 100% pela API REST do Back-end Express (/api/...).
 */
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

export const firebaseConfig = {
    apiKey: "AIzaSyBLS4BUmdmGTuwpAy_jSzYAJpyScScYY6Q",
    authDomain: "brasiinha.firebaseapp.com",
    projectId: "brasiinha",
    storageBucket: "brasiinha.firebasestorage.app",
    messagingSenderId: "350909634462",
    appId: "1:350909634462:web:c984f2001ac82fe21de88f"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

