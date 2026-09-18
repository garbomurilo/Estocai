/**
 * Middleware Global de Tratamento de Exceções
 */

function tratarErros(err, req, res, next) {
    console.error(`[API Error] ${req.method} ${req.originalUrl}:`, err.message || err);

    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        sucesso: false,
        erro: err.message || "Ocorreu um erro interno no servidor.",
        timestamp: new Date().toISOString()
    });
}

module.exports = {
    tratarErros
};
