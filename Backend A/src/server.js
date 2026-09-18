const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const { tratarErros } = require("./middlewares/errorHandler");

const app = express();

// Middlewares Globais
app.use(cors());
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
