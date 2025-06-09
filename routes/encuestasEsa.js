// routes/encuestasEsa.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const EncuestaEsa = require('../models/EncuestaEsa');

// Middleware to get a single survey by ID
async function getEncuestaEsa(req, res, next) {
  let encuesta;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de encuesta no válido' });
    }
    encuesta = await EncuestaEsa.findById(req.params.id);
    if (encuesta == null) {
      return res.status(404).json({ message: 'No se pudo encontrar la encuesta con el ID proporcionado.' });
    }
  } catch (err) {
    console.error("Error en middleware getEncuestaEsa:", err);
    return res.status(500).json({ message: "Error interno del servidor: " + err.message });
  }
  res.encuestaEsa = encuesta;
  next();
}

// GET: Obtener todos los registros de encuestas ESA con paginación
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, dni, campus, codBanner } = req.query;
    const query = {};

    if (dni) query.dni = dni;
    if (campus) query.campus = campus;
    if (codBanner) query.codBanner = codBanner;
    // Add other filters as needed, e.g., periodoAcademico

    const selectFields = req.query.fields ? req.query.fields.split(',').join(' ') : '';

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      lean: true,
      sort: { createdAt: -1 } // Example sort, adjust as needed
    };

    const encuestas = await EncuestaEsa.find(query)
      .select(selectFields)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .sort(options.sort)
      .lean();

    const totalDocs = await EncuestaEsa.countDocuments(query);

    res.json({
      data: encuestas,
      totalPages: Math.ceil(totalDocs / options.limit),
      currentPage: options.page,
      totalDocs: totalDocs,
      limit: options.limit
    });

  } catch (err) {
    console.error("Error al obtener las encuestas ESA:", err);
    res.status(500).json({ message: "Error al obtener las encuestas ESA: " + err.message });
  }
});

// GET: Obtener una encuesta ESA específica por su _id
router.get('/:id', getEncuestaEsa, (req, res) => {
  res.json(res.encuestaEsa);
});

// POST: Crear un nuevo registro de encuesta ESA individual
router.post('/', async (req, res) => {
  const encuesta = new EncuestaEsa(req.body); // Assumes req.body has camelCase keys

  try {
    const nuevaEncuesta = await encuesta.save();
    res.status(201).json(nuevaEncuesta);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ message: "Error de validación al crear la encuesta ESA", errors });
    }
    if (err.code === 11000) {
      return res.status(400).json({
        message: "Error: Ya existe un registro de encuesta ESA con algunos de los datos únicos proporcionados.",
        details: err.keyValue
      });
    }
    console.error("Error al crear la encuesta ESA:", err);
    res.status(400).json({ message: "Error al crear la encuesta ESA: " + err.message });
  }
});

// POST: Crear múltiples registros de encuestas ESA (carga masiva)
// Path: /api/esa/bulk
router.post('/bulk', async (req, res) => {
  const recordsToInsert = req.body; // Assumes req.body is an array of objects with camelCase keys

  if (!Array.isArray(recordsToInsert) || recordsToInsert.length === 0) {
    return res.status(400).json({ message: "El cuerpo de la solicitud debe ser un array de registros y no puede estar vacío." });
  }

  try {
    const result = await EncuestaEsa.insertMany(recordsToInsert, { ordered: false });
    res.status(201).json({
      message: `${result.length} registros de encuesta ESA intentados para inserción.`,
      insertedCount: result.length,
    });
  } catch (err) {
    console.error("Error en carga masiva de encuestas ESA:", err);
    if (err.name === 'MongoBulkWriteError' || err.code === 11000) {
      const errorDetails = err.writeErrors
        ? err.writeErrors.map(e => ({
            index: e.index,
            code: e.code,
            message: e.errmsg,
            failedDocumentPreview: e.err.op ? { dni: e.err.op.dni, codBanner: e.err.op.codBanner } : undefined
          }))
        : { generalMessage: err.message, code: err.code };
      return res.status(400).json({
        message: "Error durante la carga masiva de encuestas ESA. Algunos registros podrían no haberse insertado.",
        details: errorDetails
      });
    }
    res.status(500).json({ message: "Error interno del servidor durante la carga masiva de encuestas ESA: " + err.message });
  }
});

// PUT: Actualizar un registro de encuesta ESA existente
router.put('/:id', getEncuestaEsa, async (req, res) => {
  Object.assign(res.encuestaEsa, req.body); // Assumes req.body has camelCase keys

  try {
    const encuestaActualizada = await res.encuestaEsa.save();
    res.json(encuestaActualizada);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ message: "Error de validación al actualizar la encuesta ESA", errors });
    }
    if (err.code === 11000) {
      return res.status(400).json({ message: "Error de duplicado al actualizar la encuesta ESA.", details: err.keyValue });
    }
    console.error("Error al actualizar la encuesta ESA:", err);
    res.status(400).json({ message: "Error al actualizar la encuesta ESA: " + err.message });
  }
});

// DELETE: Eliminar un registro de encuesta ESA
router.delete('/:id', getEncuestaEsa, async (req, res) => {
  try {
    await res.encuestaEsa.deleteOne();
    res.json({ message: 'Encuesta ESA eliminada exitosamente' });
  } catch (err) {
    console.error("Error al eliminar la encuesta ESA:", err);
    res.status(500).json({ message: "Error al eliminar la encuesta ESA: " + err.message });
  }
});

module.exports = router;