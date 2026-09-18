/**
 * Configuração e Inicialização do Firebase Admin SDK
 * Fornece instâncias seguras do Firestore e Auth com privilégios de servidor.
 */

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const fs = require("fs");
const path = require("path");

if (!getApps().length) {
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, "../../serviceAccountKey.json");

    if (fs.existsSync(credsPath)) {
        const serviceAccount = require(credsPath);
        initializeApp({
            credential: cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID || "brasiinha"
        });
        console.log("[Firebase Admin] Inicializado com chave de conta de serviço local.");
    } else {
        // Inicialização padrão para ambiente com variáveis de ambiente ou emulador
        initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID || "brasiinha"
        });
        console.log("[Firebase Admin] Inicializado com Application Default Credentials / Project ID.");
    }
}

const db = getFirestore();
const auth = getAuth();

module.exports = {
    db,
    auth
};
