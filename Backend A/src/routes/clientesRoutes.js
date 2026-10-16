const { Router } = require("express");
const clientesController = require("../controllers/clientesController");

const router = Router();

router.get("/:cpf", clientesController.buscarPorCpf);
router.post("/", clientesController.criar); // Bug corrigido: era .cadastrar (não existe), deve ser .criar

module.exports = router;
