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

router.use("/produtos", produtosRoutes);
router.use("/pedidos", pedidosRoutes);
router.use("/clientes", clientesRoutes);

module.exports = router;
