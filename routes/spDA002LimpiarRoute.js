const express = require('express');
const router = express.Router();
const spDA002Limpiar = require('../store_procedures/spDA002Limpiar');

router.get('/', async (req, res) => {
  try {
    // leer limit y skip desde query string con defaults
    const limit = parseInt(req.query.limit) || 10000;  // default 100 registros
    const skip = parseInt(req.query.skip) || 0;      // default 0 registros

    // Pasarlos a tu store procedure
    const result = await spDA002Limpiar(limit, skip);

    res.json({
      message: 'SP ejecutado correctamente.',
      total: result.length,
      data: result
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al ejecutar SP', error: error.message });
  }
});
module.exports = router;