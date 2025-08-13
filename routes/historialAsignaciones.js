const express = require('express');
const router = express.Router();
const HistorialAsignacion = require('../models/HistorialAsignacion');

/**
 * @route   GET /api/historial-asignaciones
 * @desc    Obtener el historial de asignaciones con múltiples filtros
 * @access  Public
 * @example
 * // Para obtener todos los registros
 * GET /api/historial-asignaciones
 * 
 * // Para obtener los registros de un especialista específico
 * GET /api/historial-asignaciones?especialistaDni=12345678
 * 
 * // Para obtener solo ciertos tipos de cambios
 * GET /api/historial-asignaciones?estadoCambio=REASIGNADO,DESASIGNADO
 * 
 * // Para obtener el historial de un semestre específico
 * GET /api/historial-asignaciones?semestre=2024-1
 * 
 * // Para obtener el historial de un docente específico
 * GET /api/historial-asignaciones?idDocente=DOC123
 * 
 * // Para obtener la última ejecución
 * GET /api/historial-asignaciones?latest=true
 * 
 * // Combinando filtros
 * GET /api/historial-asignaciones?especialistaDni=12345678&estadoCambio=REASIGNADO&semestre=2024-1
 */
router.get('/', async (req, res) => {
    try {
        const { 
            especialistaDni, 
            estadoCambio, 
            semestre, 
            idDocente, 
            tieneAsignacion, // Nuevo filtro en lugar de estadoGeneral
            latest,
            fechaDesde,
            fechaHasta 
        } = req.query;

        const query = {};

        if (especialistaDni) query.especialistaDni = especialistaDni;
        
        if (estadoCambio) {
            const estados = estadoCambio.split(',').map(e => e.trim().toUpperCase());
            query.estadoCambio = { $in: estados };
        }
        
        if (semestre) query.semestre = semestre;
        if (idDocente) query.idDocente = idDocente;

        // Nuevo filtro basado en si tiene asignación
        if (tieneAsignacion !== undefined) {
            if (tieneAsignacion === 'true') {
                query.especialistaDni = { $ne: null };
            } else if (tieneAsignacion === 'false') {
                query.especialistaDni = null;
            }
        }

        if (fechaDesde || fechaHasta) {
            query.fechaHoraEjecucion = {};
            if (fechaDesde) query.fechaHoraEjecucion.$gte = new Date(fechaDesde);
            if (fechaHasta) query.fechaHoraEjecucion.$lte = new Date(fechaHasta);
        }

        if (latest === 'true') {
            const queryParaUltimaEjecucion = semestre ? { semestre } : {};
            const ultimaEjecucion = await HistorialAsignacion.findOne(queryParaUltimaEjecucion)
                .sort({ fechaHoraEjecucion: -1 })
                .lean();
            
            if (ultimaEjecucion) {
                query.fechaHoraEjecucion = ultimaEjecucion.fechaHoraEjecucion;
            } else {
                return res.json({ 
                    data: [], 
                    totalDocs: 0, 
                    resumen: {},
                    message: 'No se encontraron registros para los criterios especificados' 
                });
            }
        }

        const historial = await HistorialAsignacion.find(query)
            .sort({ fechaHoraEjecucion: -1, idDocente: 1 })
            .lean();

        // Generar resumen de cambios
        const resumen = historial.reduce((acc, registro) => {
            acc[registro.estadoCambio] = (acc[registro.estadoCambio] || 0) + 1;
            return acc;
        }, {});

        // Estadísticas adicionales
        const conAsignacion = historial.filter(h => h.especialistaDni !== null).length;
        const sinAsignacion = historial.length - conAsignacion;

        res.json({
            data: historial,
            totalDocs: historial.length,
            resumen: resumen,
            estadisticas: {
                conAsignacion,
                sinAsignacion,
                totalEspecialistasUnicos: [...new Set(historial.map(h => h.especialistaDni).filter(dni => dni))].length,
                totalDocentesUnicos: [...new Set(historial.map(h => h.idDocente))].length
            },
            filtrosAplicados: {
                especialistaDni: especialistaDni || null,
                estadoCambio: estadoCambio || null,
                semestre: semestre || null,
                idDocente: idDocente || null,
                tieneAsignacion: tieneAsignacion || null,
                latest: latest || null,
                fechaDesde: fechaDesde || null,
                fechaHasta: fechaHasta || null
            }
        });

    } catch (err) {
        console.error('Error al obtener el historial de asignaciones:', err);
        res.status(500).json({ 
            message: 'Error al obtener el historial de asignaciones', 
            error: err.message 
        });
    }
});

/**
 * @route   GET /api/historial-asignaciones/especialista/:dni
 * @desc    Obtener el historial completo de un especialista específico
 * @access  Public
 */
router.get('/especialista/:dni', async (req, res) => {
  try {
    const { dni } = req.params;
    const { semestre, estadoCambio } = req.query;

    const query = { especialistaDni: dni };
    
    if (semestre) query.semestre = semestre;
    if (estadoCambio) {
      const estados = estadoCambio.split(',').map(e => e.trim());
      query.estadoCambio = { $in: estados };
    }

    const historial = await HistorialAsignacion.find(query)
      .sort({ fechaHoraEjecucion: -1, idDocente: 1 })
      .lean();

    // Resumen específico para el especialista
    const resumen = {
      totalAsignaciones: historial.length,
      porTipoCambio: historial.reduce((acc, h) => {
        acc[h.estadoCambio] = (acc[h.estadoCambio] || 0) + 1;
        return acc;
      }, {}),
      docentesUnicos: [...new Set(historial.map(h => h.idDocente))].length,
      semestres: [...new Set(historial.map(h => h.semestre))]
    };

    res.json({
      especialistaDni: dni,
      nombreEspecialista: historial[0]?.nombreEspecialista || null,
      data: historial,
      resumen: resumen
    });

  } catch (err) {
    console.error('Error al obtener el historial del especialista:', err);
    res.status(500).json({ 
      message: 'Error al obtener el historial del especialista', 
      error: err.message 
    });
  }
});

/**
 * @route   GET /api/historial-asignaciones/resumen
 * @desc    Obtener un resumen estadístico del historial
 * @access  Public
 */
router.get('/resumen', async (req, res) => {
  try {
    const { semestre } = req.query;
    const query = semestre ? { semestre } : {};

    const historial = await HistorialAsignacion.find(query).lean();

    const resumen = {
      totalRegistros: historial.length,
      porTipoCambio: historial.reduce((acc, h) => {
        acc[h.estadoCambio] = (acc[h.estadoCambio] || 0) + 1;
        return acc;
      }, {}),
      especialistasUnicos: [...new Set(historial.map(h => h.especialistaDni).filter(dni => dni))].length,
      docentesUnicos: [...new Set(historial.map(h => h.idDocente))].length,
      semestres: [...new Set(historial.map(h => h.semestre))],
      ultimaEjecucion: historial.length > 0 ? 
        Math.max(...historial.map(h => new Date(h.fechaHoraEjecucion).getTime())) : null
    };

    res.json(resumen);

  } catch (err) {
    console.error('Error al obtener el resumen del historial:', err);
    res.status(500).json({ 
      message: 'Error al obtener el resumen del historial', 
      error: err.message 
    });
  }
});

module.exports = router;