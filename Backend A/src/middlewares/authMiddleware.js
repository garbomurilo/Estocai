/**
 * Middleware de Autenticação JWT via Firebase Auth
 * Valida o cabeçalho Authorization: Bearer <token>
 */

const { auth } = require("../config/firebase");

async function autenticar(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        // Em ambiente de desenvolvimento local, permite continuar com usuário padrão se configurado
        if (process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_AUTH === "true") {
            req.user = { uid: "dev-operator", email: "operador@brasinha.com" };
            return next();
        }

        return res.status(401).json({
            sucesso: false,
            erro: "Acesso não autorizado. Cabeçalho de autorização ausente ou mal formatado."
        });
    }

    const token = authHeader.split("Bearer ")[1];

    try {
        const decodedToken = await auth.verifyIdToken(token);
        req.user = decodedToken;
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
