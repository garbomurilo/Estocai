const { Router } = require("express");
const produtosRoutes = require("./produtosRoutes");
const pedidosRoutes = require("./pedidosRoutes");
const clientesRoutes = require("./clientesRoutes");

const router = Router();

router.get("/health", (req, res) => {
    res.status(200).json({
        status: "online",
        sistema: "Estocaí REST API (Backend A)",
        ambiente: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString()
    });
});

const { autenticar } = require("../middlewares/authMiddleware");

// Rota pública do cardápio digital (não precisa de token)
router.get("/produtos/public/:tenantId", require("../controllers/produtosController").listarPublico);

// Rotas protegidas
router.use("/produtos", autenticar, produtosRoutes);
router.use("/pedidos", autenticar, pedidosRoutes);
router.use("/clientes", autenticar, clientesRoutes);

module.exports = router;
