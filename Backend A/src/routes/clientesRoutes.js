const { Router } = require("express");
const clientesController = require("../controllers/clientesController");

const router = Router();

router.get("/:cpf", clientesController.buscarPorCpf);
router.post("/", clientesController.cadastrar);

module.exports = router;
