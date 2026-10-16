/**
 * Middleware de Autenticação JWT via Firebase Auth e Validação de Tenant
 * Valida o cabeçalho Authorization: Bearer <token>
 */

const { auth, db, hasCredentials } = require("../config/firebase");

async function autenticar(req, res, next) {
    const authHeader = req.headers.authorization;

    let explicitTenantId = req.headers["x-tenant-id"] || req.query.tenantId;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        if (process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_AUTH === "true") {
            req.user = { uid: "dev-operator", email: "operador@estocai.com" };
            req.tenantId = explicitTenantId || process.env.DEFAULT_TENANT || "brasinha";
            return next();
        }

        return res.status(401).json({
            sucesso: false,
            erro: "Acesso não autorizado. Cabeçalho de autorização ausente ou mal formatado."
        });
    }

    const token = authHeader.split("Bearer ")[1];

    try {
        if (!hasCredentials && process.env.NODE_ENV === "development") {
            req.user = { uid: "dev-operator", email: "operador@estocai.com" };
            req.tenantId = explicitTenantId || "brasinha";
            return next();
        }

        const decodedToken = await auth.verifyIdToken(token);
        req.user = decodedToken;

        let tenantId = explicitTenantId || decodedToken.tenantId;

        // Se o cabeçalho não especificou o tenant, busca no documento do usuário em 'users/{uid}'
        if (!tenantId) {
            try {
                const userDoc = await db.collection("users").doc(decodedToken.uid).get();
                if (userDoc.exists && userDoc.data()?.tenantId) {
                    tenantId = userDoc.data().tenantId;
                }
            } catch {}
        }

        // Fallback em ambiente de dev
        if (!tenantId && process.env.NODE_ENV === "development") {
            tenantId = "brasinha";
        }

        if (!tenantId) {
            return res.status(403).json({
                sucesso: false,
                erro: "Nenhum negócio (tenant) foi especificado ou associado à sua conta."
            });
        }

        req.tenantId = tenantId;
        next();
    } catch (error) {
        console.error("[Auth Middleware] Falha na validação do token:", error.message);
        return res.status(403).json({
            sucesso: false,
            erro: "Token de autenticação inválido ou expirado."
        });
    }
}

module.exports = {
    autenticar
};
