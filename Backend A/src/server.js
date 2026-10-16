const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const { tratarErros } = require("./middlewares/errorHandler");

const app = express();

// Middlewares Globais
app.use(cors({
    origin: (origin, callback) => {
        // Permite requisições sem origin (como curl, Postman, mobile ou server-to-server)
        if (!origin) return callback(null, true);

        // Em desenvolvimento, permite qualquer porta local
        if (process.env.NODE_ENV === "development") {
            if (/^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
                return callback(null, true);
            }
        }

        const allowed = [
            "http://localhost:5173",
            "http://localhost:4173",
            process.env.FRONTEND_URL
        ].filter(Boolean);

        if (allowed.includes(origin)) {
            return callback(null, true);
        }

        return callback(null, true); // Permite no ambiente de desenvolvimento
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID"],
    credentials: true
}));
app.use(express.json());

// Log básico de requisições
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// Rotas da API
app.use("/api", routes);

// Rota raiz
app.get("/", (req, res) => {
    res.json({
        mensagem: "Estocaí API REST v1.0 está em execução.",
        documentacao: "/api/health"
    });
});

// Tratamento de rota não encontrada (404)
app.use((req, res, next) => {
    res.status(404).json({
        sucesso: false,
        erro: `Endpoint ${req.method} ${req.originalUrl} não encontrado.`
    });
});

// Middleware Global de Tratamento de Erros
app.use(tratarErros);

module.exports = app;
