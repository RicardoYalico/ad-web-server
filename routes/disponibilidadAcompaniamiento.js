// routes/disponibilidadAcompaniamiento.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const DisponibilidadAcompaniamiento = require('../models/DisponibilidadAcompaniamiento');

// Middleware para obtener una disponibilidad por ID
async function getDisponibilidad(req, res, next) {
  let disponibilidad;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de disponibilidad no válido' });
    }
    disponibilidad = await DisponibilidadAcompaniamiento.findById(req.params.id);
    if (disponibilidad == null) {
      return res.status(404).json({ message: 'No se pudo encontrar la disponibilidad con el ID proporcionado.' });
    }
  } catch (err) {
    console.error("Error en middleware getDisponibilidad:", err);
    return res.status(500).json({ message: "Error interno del servidor: " + err.message });
  }
  res.disponibilidad = disponibilidad;
  next();
}

// GET: Obtener todos los registros de disponibilidad con paginación
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, dni, sede, dia, turno } = req.query;
    const query = {};

    if (dni) query.dni = { $regex: dni, $options: "i" }; // Búsqueda insensible a mayúsculas/minúsculas
    if (sede) query.sede1DePreferenciaPresencial = { $regex: sede, $options: "i" };
    if (dia) query.dia = { $regex: dia, $options: "i" };
    if (turno) query.turno = { $regex: turno, $options: "i" };
    // Agrega otros filtros si son necesarios, ej: periodoAcademico

    const selectFields = req.query.fields ? req.query.fields.split(',').join(' ') : '';

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      lean: true,
      sort: { apellidosNombresCompletos: 1, dia: 1, franja: 1 } // Ejemplo de ordenamiento
    };

    const disponibilidades = await DisponibilidadAcompaniamiento.find(query)
      .select(selectFields)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .sort(options.sort)
      .lean();

    const totalDocs = await DisponibilidadAcompaniamiento.countDocuments(query);

    res.json({
      data: disponibilidades,
      totalPages: Math.ceil(totalDocs / options.limit),
      currentPage: options.page,
      totalDocs: totalDocs,
      limit: options.limit
    });

  } catch (err) {
    console.error("Error al obtener las disponibilidades:", err);
    res.status(500).json({ message: "Error al obtener las disponibilidades: " + err.message });
  }
});

// GET: Obtener una disponibilidad específica por su _id
router.get('/:id', getDisponibilidad, (req, res) => {
  res.json(res.disponibilidad);
});

// POST: Crear un nuevo registro de disponibilidad individual
router.post('/', async (req, res) => {
  const disponibilidad = new DisponibilidadAcompaniamiento(req.body);

  try {
    const nuevaDisponibilidad = await disponibilidad.save();
    res.status(201).json(nuevaDisponibilidad);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ message: "Error de validación al crear la disponibilidad", errors });
    }
    if (err.code === 11000) { // Error de clave duplicada (por el index unique)
      return res.status(400).json({
        message: "Error: Ya existe un registro de disponibilidad con estos mismos datos (DNI, sede, día, franja, turno).",
        details: err.keyValue
      });
    }
    console.error("Error al crear la disponibilidad:", err);
    res.status(400).json({ message: "Error al crear la disponibilidad: " + err.message });
  }
});

// POST: Crear múltiples registros de disponibilidad (carga masiva)
// Path: /api/disponibilidad-acompaniamiento/bulk (o el que prefieras)
router.post('/bulk', async (req, res) => {
  const recordsToInsert = req.body;

  if (!Array.isArray(recordsToInsert) || recordsToInsert.length === 0) {
    return res.status(400).json({ message: "El cuerpo de la solicitud debe ser un array de registros y no puede estar vacío." });
  }

  try {
    const result = await DisponibilidadAcompaniamiento.insertMany(recordsToInsert, { ordered: false });
    res.status(201).json({
      message: `${result.length} registros de disponibilidad intentados para inserción.`,
      insertedCount: result.length,
    });
  } catch (err) {
    console.error("Error en carga masiva de disponibilidad:", err);
    if (err.name === 'MongoBulkWriteError' || err.code === 11000) {
      const errorDetails = err.writeErrors
        ? err.writeErrors.map(e => ({
            index: e.index, // El índice en el array original `recordsToInsert`
            code: e.code,
            message: e.errmsg,
            // `e.err.op` contiene el documento que falló
            failedDocumentPreview: e.err.op ? { dni: e.err.op.dni, dia: e.err.op.dia, franja: e.err.op.franja } : "No disponible"
          }))
        : { generalMessage: err.message, code: err.code }; // Error general si no hay `writeErrors`
      return res.status(400).json({
        message: "Error durante la carga masiva de disponibilidad. Algunos registros podrían no haberse insertado (posiblemente duplicados).",
        details: errorDetails
      });
    }
    res.status(500).json({ message: "Error interno del servidor durante la carga masiva: " + err.message });
  }
});

// PUT: Actualizar un registro de disponibilidad existente
router.put('/:id', getDisponibilidad, async (req, res) => {
  Object.assign(res.disponibilidad, req.body);

  try {
    const disponibilidadActualizada = await res.disponibilidad.save();
    res.json(disponibilidadActualizada);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ message: "Error de validación al actualizar la disponibilidad", errors });
    }
    if (err.code === 11000) {
      return res.status(400).json({ message: "Error de duplicado al actualizar la disponibilidad.", details: err.keyValue });
    }
    console.error("Error al actualizar la disponibilidad:", err);
    res.status(400).json({ message: "Error al actualizar la disponibilidad: " + err.message });
  }
});

// DELETE: Eliminar un registro de disponibilidad
router.delete('/:id', getDisponibilidad, async (req, res) => {
  try {
    await res.disponibilidad.deleteOne();
    res.json({ message: 'Disponibilidad eliminada exitosamente' });
  } catch (err) {
    console.error("Error al eliminar la disponibilidad:", err);
    res.status(500).json({ message: "Error al eliminar la disponibilidad: " + err.message });
  }
});

module.exports = router;