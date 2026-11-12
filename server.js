const path = require('path');

// Garante carregamento dos pacotes instalados em backend/node_modules
const backendNodeModules = path.join(__dirname, 'backend', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
require('dotenv').config();

const authRoutes = require('./backend/src/routes/authRoutes');
const produtosRoutes = require('./backend/src/routes/produtosRoutes');
const clientesRoutes = require('./backend/src/routes/clientesRoutes');
const pedidosRoutes = require('./backend/src/routes/pedidosRoutes');
const usuariosRoutes = require('./backend/src/routes/usuariosRoutes');
const configuracoesRoutes = require('./backend/src/routes/configuracoesRoutes');
const expedientesRoutes = require('./backend/src/routes/expedientesRoutes');
const estoqueDiaRoutes = require('./backend/src/routes/estoqueDiaRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =========================================================================
// Rotas da API REST (Backend Multi-Tenant via Firebase Admin SDK)
// =========================================================================
app.use('/api/auth', authRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/estoque-dia', estoqueDiaRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/fidelidade', clientesRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/configuracoes', configuracoesRoutes);
app.use('/api/expediente', expedientesRoutes);
app.use('/api/expedientes', expedientesRoutes);

// Desabilita cache para refletir alterações imediatamente
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
});

// Integração de Build: serve a pasta dist do React/Vite em produção e arquivos estáticos auxiliares
app.use(express.static(path.join(__dirname, 'frontend/dist'), { etag: false, lastModified: false }));
app.use(express.static(__dirname, { etag: false, lastModified: false }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`  Estocaí (API REST + Front-end) ativo!`);
    console.log(`  > Painel Principal: http://localhost:${PORT}/`);
    console.log(`  > Cardápio:         http://localhost:${PORT}/cardapio.html`);
    console.log(`  > API REST:         http://localhost:${PORT}/api`);
    console.log(`=========================================`);
});
