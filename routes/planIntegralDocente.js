// routes/planIntegralDocente.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const PlanIntegralDocente = require('../models/PlanIntegralDocente'); // Asegúrate que la ruta al modelo sea correcta

// --- RUTAS ESPECÍFICAS PRIMERO ---

// GET: Endpoint para generar un reporte agregado por semestre y fecha de carga
router.get('/reporte', async (req, res) => {
  try {
    const reporte = await PlanIntegralDocente.aggregate([
      {
        $group: {
          _id: {
            semestre: "$semestre",
            fechaCarga: "$fechaCarga" 
          },
          cantidad: { $sum: 1 },
          ultimaActualizacion: { $max: "$updatedAt" }
        }
      },
      {
        $project: {
          _id: 0,
          semestre: "$_id.semestre",
          fechaCarga: "$_id.fechaCarga",
          cantidad: "$cantidad",
          ultimaActualizacion: "$ultimaActualizacion"
        }
      },
      {
        $sort: {
          semestre: -1, // Semestres más recientes primero
          fechaCarga: -1 // Fechas de carga más recientes primero
        }
      }
    ]);

    res.json(reporte);
  } catch (err) {
    console.error('Error al generar el reporte de Planes Integrales:', err);
    res.status(500).json({ message: 'Error al generar el reporte', error: err.message });
  }
});


// GET: Obtener todos los planes con paginación y filtros
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, fields, ...queryParams } = req.query;
    const query = {};

    // Filtros dinámicos basados en el modelo
    const filterableFields = ['dni', 'campus', 'banner', 'facultad', 'carrera', 'semestre'];
    for (const key in queryParams) {
        if (filterableFields.includes(key)) {
            // Búsqueda insensible a mayúsculas/minúsculas para strings
            query[key] = new RegExp(queryParams[key], 'i');
        }
    }
    
    const selectFields = fields ? fields.split(',').join(' ') : '';
    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      lean: true,
      sort: { createdAt: -1 }
    };

    const planes = await PlanIntegralDocente.find(query)
      .select(selectFields)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .sort(options.sort)
      .lean();

    const totalDocs = await PlanIntegralDocente.countDocuments(query);

    res.json({
      data: planes,
      totalPages: Math.ceil(totalDocs / options.limit),
      currentPage: options.page,
      totalDocs: totalDocs,
      limit: options.limit
    });
  } catch (err) {
    console.error("Error al obtener los Planes Integrales:", err);
    res.status(500).json({ message: "Error al obtener los Planes Integrales: " + err.message });
  }
});

// POST: Crear un nuevo registro de Plan Integral
router.post('/', async (req, res) => {
  const plan = new PlanIntegralDocente(req.body);
  try {
    const nuevoPlan = await plan.save();
    res.status(201).json(nuevoPlan);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => { errors[key] = err.errors[key].message; });
      return res.status(400).json({ message: "Error de validación", errors });
    }
    if (err.code === 11000) {
      return res.status(409).json({ message: "Conflicto: Ya existe un registro con datos únicos proporcionados.", details: err.keyValue });
    }
    res.status(400).json({ message: "Error al crear el Plan Integral: " + err.message });
  }
});

// POST: Carga masiva de Planes Integrales
router.post('/bulk', async (req, res) => {
  const recordsToInsert = req.body;
  if (!Array.isArray(recordsToInsert) || recordsToInsert.length === 0) {
    return res.status(400).json({ message: "El cuerpo debe ser un array de registros." });
  }

  try {
    const result = await PlanIntegralDocente.insertMany(recordsToInsert, { ordered: false });
    res.status(201).json({
      message: `Lote procesado. Insertados exitosamente: ${result.length} de ${recordsToInsert.length} registros.`,
      insertedCount: result.length,
    });
  } catch (err) {
    const successfulInserts = err.result?.nInserted || 0;
    const failedCount = recordsToInsert.length - successfulInserts;
    res.status(400).json({
      message: `Error en inserción de lote. Insertados: ${successfulInserts}. Fallidos: ${failedCount}.`,
      details: err.writeErrors ? err.writeErrors.map(e => ({ index: e.index, code: e.code, error: e.errmsg })) : err.message,
    });
  }
});


// --- RUTAS GENÉRICAS (CON PARÁMETROS) DESPUÉS ---

// Middleware para obtener un plan por su ID
async function getPlanIntegralDocente(req, res, next) {
  let plan;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de plan no válido' });
    }
    plan = await PlanIntegralDocente.findById(req.params.id);
    if (plan == null) {
      return res.status(404).json({ message: 'No se pudo encontrar el plan con el ID proporcionado.' });
    }
  } catch (err) {
    return res.status(500).json({ message: "Error interno del servidor: " + err.message });
  }
  res.planIntegralDocente = plan;
  next();
}

// GET: Obtener un plan específico por su _id
router.get('/:id', getPlanIntegralDocente, (req, res) => {
  res.json(res.planIntegralDocente);
});


// PUT: Actualizar un plan existente
router.put('/:id', getPlanIntegralDocente, async (req, res) => {
  Object.assign(res.planIntegralDocente, req.body);
  try {
    const planActualizado = await res.planIntegralDocente.save();
    res.json(planActualizado);
  } catch (err) {
    if (err.name === 'ValidationError') {
        let errors = {};
        Object.keys(err.errors).forEach((key) => { errors[key] = err.errors[key].message; });
        return res.status(400).json({ message: "Error de validación al actualizar", errors });
    }
    if (err.code === 11000) {
        return res.status(409).json({ message: "Conflicto de duplicado al actualizar.", details: err.keyValue });
    }
    res.status(400).json({ message: "Error al actualizar el Plan Integral: " + err.message });
  }
});

// DELETE: Eliminar por lote basado en semestre y fechaCarga
router.delete('/bulk', async (req, res) => {
  const { semestre, fechaCarga } = req.body;
  if (!semestre || !fechaCarga) {
    return res.status(400).json({ message: 'Los campos "semestre" y "fechaCarga" son requeridos.' });
  }
  
  try {
    // Para que coincida con una fecha sin importar la hora, creamos un rango de ese día
    const startDate = new Date(fechaCarga);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);

    const filter = {
      semestre: semestre,
      fechaCarga: { $gte: startDate, $lt: endDate }
    };

    const result = await PlanIntegralDocente.deleteMany(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: `No se encontraron registros para eliminar.` });
    }

    res.status(200).json({ message: `Se eliminaron ${result.deletedCount} registros.` });
  } catch (err) {
    res.status(500).json({ message: "Error interno del servidor.", error: err.message });
  }
});


// DELETE: Eliminar un plan por ID
router.delete('/:id', getPlanIntegralDocente, async (req, res) => {
  try {
    await res.planIntegralDocente.deleteOne();
    res.json({ message: 'Plan Integral eliminado exitosamente' });
  } catch (err) {
    res.status(500).json({ message: "Error al eliminar el Plan Integral: " + err.message });
  }
});

module.exports = router;
