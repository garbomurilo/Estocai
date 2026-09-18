/**
 * Ponto de Entrada da API REST do Sistema Estocaí (Backend A)
 * Arquitetura em Camadas com Node.js, Express e Firebase Admin SDK
 */

require("dotenv").config();
const app = require("./src/server");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("==================================================");
    console.log(`🚀 Servidor Estocaí API rodando na porta ${PORT}`);
    console.log(`📡 URL Base: http://localhost:${PORT}/api`);
    console.log(`🩺 Health Check: http://localhost:${PORT}/api/health`);
    console.log("==================================================");
});
