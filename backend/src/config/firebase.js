const path = require('path');
const fs = require('fs');

// Garante que node_modules de backend seja encontrado mesmo rodando a partir da raiz
const backendNodeModules = path.join(__dirname, '..', '..', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

const admin = require('firebase-admin');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'brasiinha';
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', '..', 'serviceAccountKey.json');

/**
 * Carrega as credenciais da conta de serviço do Firebase Admin a partir de:
 * 1. Variável de ambiente FIREBASE_SERVICE_ACCOUNT (JSON puro ou Base64) - recomendado para Render/Vercel/Railway
 * 2. Variável de ambiente FIREBASE_SERVICE_ACCOUNT_BASE64 (JSON em Base64)
 * 3. Arquivo local backend/serviceAccountKey.json
 */
function loadServiceAccount() {
    const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (rawEnv && rawEnv.trim()) {
        const trimmed = rawEnv.trim();
        try {
            if (trimmed.startsWith('{')) {
                return JSON.parse(trimmed);
            }
            const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
            return JSON.parse(decoded);
        } catch (err) {
            console.error('[Firebase] Erro ao fazer parse da variável FIREBASE_SERVICE_ACCOUNT:', err.message);
        }
    }

    if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
        } catch (err) {
            console.error('[Firebase] Erro ao ler serviceAccountKey.json:', err.message);
        }
    }

    return null;
}

// Inicializa o Firebase Admin SDK com Cloud Firestore real
if (!admin.apps.length) {
    const serviceAccount = loadServiceAccount();

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || PROJECT_ID
        });
        console.log(`[Firebase] Cloud Firestore inicializado com Service Account (projeto: ${serviceAccount.project_id || PROJECT_ID}).`);
    } else {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: PROJECT_ID
        });
        console.log(`[Firebase] Cloud Firestore inicializado com Application Default Credentials (projeto: ${PROJECT_ID}).`);
    }
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const auth = admin.auth();

module.exports = { admin, db, auth };
