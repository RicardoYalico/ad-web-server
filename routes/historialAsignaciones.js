const express = require('express');
const router = express.Router();
const HistorialAsignacion = require('../models/HistorialAsignacion'); // Asegúrate de que la ruta a tu modelo sea correcta

/**
 * @route   GET /api/historial-asignaciones
 * @desc    Obtener el historial de asignaciones. 
 * Se puede filtrar por el DNI del especialista a través de un query param.
 * @access  Public
 * @example
 * // Para obtener todos los registros
 * GET /api/historial-asignaciones
 * * // Para obtener los registros de un especialista específico
 * GET /api/historial-asignaciones?especialistaDni=12345678
 */
router.get('/', async (req, res) => {
  try {
    // Objeto para construir la consulta a la base de datos.
    const query = {};

    // Si el query param 'especialistaDni' está presente en la URL,
    // se agrega al objeto de consulta.
    if (req.query.especialistaDni) {
      query.especialistaDni = req.query.especialistaDni;
    }

    // Se busca en la colección 'historial_asignaciones_especialistas' usando el modelo
    // y el filtro construido. Si el filtro está vacío, traerá todos los documentos.
    const historial = await HistorialAsignacion.find(query)
      .sort({ fechaHoraEjecucion: -1 }); // Opcional: ordena los resultados por fecha descendente

    res.json(historial);

  } catch (err) {
    console.error(err); // Es una buena práctica loguear el error en el servidor
    res.status(500).json({ message: 'Error al obtener el historial de asignaciones', error: err.message });
  }
});

module.exports = router;