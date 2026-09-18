const { Router } = require("express");
const pedidosController = require("../controllers/pedidosController");

const router = Router();

router.get("/", pedidosController.listar);
router.get("/:id", pedidosController.buscarPorId);
router.post("/fechar", pedidosController.fechar); // Endpoint principal de fechamento com baixa atômica
router.post("/:id/cancelar", pedidosController.cancelar);

module.exports = router;
