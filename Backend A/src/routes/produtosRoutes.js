const { Router } = require("express");
const produtosController = require("../controllers/produtosController");

const router = Router();

// Rotas protegidas (quando chamadas via /produtos puro)
router.get("/", produtosController.listar);
router.get("/:id", produtosController.buscarPorId);
router.post("/", produtosController.criar);
router.put("/:id", produtosController.atualizar);

module.exports = router;
