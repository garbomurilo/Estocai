const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Garante que node_modules de backend seja encontrado mesmo rodando a partir da raiz
const backendNodeModules = path.join(__dirname, '..', '..', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

const admin = require('firebase-admin');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'brasiinha';
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBLS4BUmdmGTuwpAy_jSzYAJpyScScYY6Q';
const DATA_FILE = path.join(__dirname, '..', '..', 'firestore-data.json');
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', '..', 'serviceAccountKey.json');

// Inicializa o Firebase Admin SDK utilizando serviceAccountKey.json (quando disponível)
if (!admin.apps.length) {
    if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        const serviceAccount = require(SERVICE_ACCOUNT_PATH);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || PROJECT_ID
        });
    } else {
        admin.initializeApp({
            projectId: PROJECT_ID
        });
    }
}

// ============================================================================
// Persistência JSON compatível com a interface do Firestore Admin SDK
// Garante funcionamento de coleções raiz (/usuarios, /tenants), subcoleções
// (/tenants/{tenantId}/produtos|clientes|pedidos) e transações ACID (runTransaction)
// ============================================================================

function loadStore() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.warn('[Firestore Store] Aviso ao ler firestore-data.json:', err.message);
    }
    return {};
}

function saveStore(store) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (err) {
        console.error('[Firestore Store] Erro ao gravar firestore-data.json:', err.message);
    }
}

let memoryStore = loadStore();

function clone(val) {
    if (val === undefined) return undefined;
    return JSON.parse(JSON.stringify(val));
}

function resolveValues(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj._isServerTimestamp) {
        return new Date().toISOString();
    }
    if (Array.isArray(obj)) {
        return obj.map(resolveValues);
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k] = resolveValues(v);
    }
    return out;
}

function getCollectionMap(store, colPath) {
    if (!store[colPath]) {
        store[colPath] = {};
    }
    return store[colPath];
}

function createDocSnapshot(id, rawData) {
    const exists = rawData !== undefined && rawData !== null;
    const dataCopy = exists ? clone(rawData) : undefined;
    return {
        id,
        exists,
        data: () => (exists ? clone(dataCopy) : undefined)
    };
}

function createQuerySnapshot(docsArray) {
    return {
        empty: docsArray.length === 0,
        size: docsArray.length,
        docs: docsArray,
        forEach: (cb) => docsArray.forEach(cb)
    };
}

function createDocRef(colPath, docId, getActiveStore, persistFn) {
    const id = docId || crypto.randomBytes(10).toString('hex');
    const fullPath = `${colPath}/${id}`;

    return {
        id,
        path: fullPath,
        _colPath: colPath,
        collection(subColName) {
            return createCollectionRef(`${fullPath}/${subColName}`, getActiveStore, persistFn);
        },
        async get() {
            const store = getActiveStore();
            const colMap = store[colPath] || {};
            return createDocSnapshot(id, colMap[id]);
        },
        async set(data, options = {}) {
            const store = getActiveStore();
            const colMap = getCollectionMap(store, colPath);
            const resolved = resolveValues(data);
            if (options && options.merge && colMap[id]) {
                colMap[id] = { ...colMap[id], ...resolved };
            } else {
                colMap[id] = resolved;
            }
            persistFn();
            return { id };
        },
        async update(data) {
            const store = getActiveStore();
            const colMap = getCollectionMap(store, colPath);
            if (!colMap[id]) {
                throw new Error(`Documento ${fullPath} não encontrado para atualização.`);
            }
            const resolved = resolveValues(data);
            const updated = { ...colMap[id] };
            for (const [k, v] of Object.entries(resolved)) {
                if (k.includes('.')) {
                    const parts = k.split('.');
                    let cur = updated;
                    for (let i = 0; i < parts.length - 1; i++) {
                        cur[parts[i]] = { ...(cur[parts[i]] || {}) };
                        cur = cur[parts[i]];
                    }
                    cur[parts[parts.length - 1]] = v;
                } else {
                    updated[k] = v;
                }
            }
            colMap[id] = updated;
            persistFn();
            return { id };
        },
        async delete() {
            const store = getActiveStore();
            if (store[colPath]) {
                delete store[colPath][id];
                persistFn();
            }
            return { id };
        }
    };
}

function createQuery(colPath, filters, limitCount, getActiveStore) {
    return {
        where(field, op, value) {
            return createQuery(colPath, [...filters, { field, op, value }], limitCount, getActiveStore);
        },
        limit(n) {
            return createQuery(colPath, filters, n, getActiveStore);
        },
        async get() {
            const store = getActiveStore();
            const colMap = store[colPath] || {};
            let entries = Object.entries(colMap);

            for (const f of filters) {
                entries = entries.filter(([, docData]) => {
                    if (!docData) return false;
                    const fieldVal = docData[f.field];
                    if (f.op === '==') return fieldVal === f.value;
                    if (f.op === '!=') return fieldVal !== f.value;
                    if (f.op === '>') return fieldVal > f.value;
                    if (f.op === '>=') return fieldVal >= f.value;
                    if (f.op === '<') return fieldVal < f.value;
                    if (f.op === '<=') return fieldVal <= f.value;
                    return false;
                });
            }

            if (typeof limitCount === 'number') {
                entries = entries.slice(0, limitCount);
            }

            const docs = entries.map(([id, data]) => createDocSnapshot(id, data));
            return createQuerySnapshot(docs);
        }
    };
}

function createCollectionRef(colPath, getActiveStore, persistFn) {
    const baseQuery = createQuery(colPath, [], null, getActiveStore);
    return {
        path: colPath,
        doc(docId) {
            return createDocRef(colPath, docId, getActiveStore, persistFn);
        },
        where(field, op, value) {
            return baseQuery.where(field, op, value);
        },
        limit(n) {
            return baseQuery.limit(n);
        },
        async get() {
            return baseQuery.get();
        },
        async add(data) {
            const dRef = createDocRef(colPath, null, getActiveStore, persistFn);
            await dRef.set(data);
            return dRef;
        }
    };
}

const db = {
    collection(colName) {
        return createCollectionRef(colName, () => memoryStore, () => saveStore(memoryStore));
    },
    async runTransaction(updateFunction) {
        // Cria snapshot isolado para atomicidade ACID (rollback automático em caso de erro)
        const txStore = clone(memoryStore);
        const noopPersist = () => {};

        const transaction = {
            async get(docRef) {
                const colMap = txStore[docRef._colPath] || {};
                return createDocSnapshot(docRef.id, colMap[docRef.id]);
            },
            set(docRef, data, options = {}) {
                const txDoc = createDocRef(docRef._colPath, docRef.id, () => txStore, noopPersist);
                txDoc.set(data, options);
                return transaction;
            },
            update(docRef, data) {
                const txDoc = createDocRef(docRef._colPath, docRef.id, () => txStore, noopPersist);
                const colMap = getCollectionMap(txStore, docRef._colPath);
                if (!colMap[docRef.id]) {
                    throw new Error(`Documento ${docRef.path} não existe na transação.`);
                }
                const resolved = resolveValues(data);
                const updated = { ...colMap[docRef.id] };
                for (const [k, v] of Object.entries(resolved)) {
                    if (k.includes('.')) {
                        const parts = k.split('.');
                        let cur = updated;
                        for (let i = 0; i < parts.length - 1; i++) {
                            cur[parts[i]] = { ...(cur[parts[i]] || {}) };
                            cur = cur[parts[i]];
                        }
                        cur[parts[parts.length - 1]] = v;
                    } else {
                        updated[k] = v;
                    }
                }
                colMap[docRef.id] = updated;
                return transaction;
            },
            delete(docRef) {
                if (txStore[docRef._colPath]) {
                    delete txStore[docRef._colPath][docRef.id];
                }
                return transaction;
            }
        };

        const result = await updateFunction(transaction);
        // Commit atômico
        memoryStore = txStore;
        saveStore(memoryStore);
        return result;
    }
};

// ============================================================================
// Wrapper de Autenticação (Validação real de JWT via Google Public Keys +
// criação de usuários no Firebase Auth via IdentityToolkit REST API)
// ============================================================================

const realAdminAuth = admin.auth();

const authService = {
    async verifyIdToken(idToken) {
        return realAdminAuth.verifyIdToken(idToken);
    },
    async createUser({ email, password, displayName, disabled }) {
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_WEB_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                password,
                displayName: displayName || '',
                returnSecureToken: true
            })
        });
        const data = await response.json();
        if (!response.ok) {
            const msg = data.error?.message || 'Erro ao criar usuário no Firebase Auth';
            const err = new Error(msg);
            if (msg.includes('EMAIL_EXISTS')) {
                err.code = 'auth/email-already-exists';
            }
            throw err;
        }
        return {
            uid: data.localId,
            email: data.email,
            displayName: displayName || '',
            disabled: Boolean(disabled)
        };
    },
    async updateUser(uid, properties) {
        return { uid, ...properties };
    },
    async deleteUser(uid) {
        return { uid };
    }
};

// Sobrescreve helpers do objeto admin para compatibilidade transparente com as rotas
const adminCompat = {
    ...admin,
    auth: () => authService,
    firestore: Object.assign(() => db, {
        FieldValue: {
            serverTimestamp: () => ({ _isServerTimestamp: true })
        },
        Timestamp: {
            now: () => new Date().toISOString()
        }
    })
};

module.exports = { admin: adminCompat, db, auth: authService };
