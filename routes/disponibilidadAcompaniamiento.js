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

// GET: Obtener todos los registros, con opción de filtrar por DNI de especialista
router.get('/', async (req, res) => {
  try {
    const { dni, sede, dia, turno, dniEspecialista } = req.query;
    const query = {};

    // Si se provee 'dniEspecialista', se usa para una búsqueda exacta y prioritaria.
    if (dniEspecialista) {
      query.dni = dniEspecialista; // Búsqueda exacta
    } else if (dni) {
      // Si no, se usa 'dni' para una búsqueda parcial (como antes).
      query.dni = { $regex: dni, $options: "i" };
    }

    // Resto de los filtros
    if (sede) query.sede1DePreferenciaPresencial = { $regex: sede, $options: "i" };
    if (dia) query.dia = { $regex: dia, $options: "i" };
    if (turno) query.turno = { $regex: turno, $options: "i" };

    const selectFields = req.query.fields ? req.query.fields.split(',').join(' ') : '';
    const sortOptions = { apellidosNombresCompletos: 1, dia: 1, franja: 1 };

    const disponibilidades = await DisponibilidadAcompaniamiento.find(query)
      .select(selectFields)
      .sort(sortOptions)
      .lean();

    res.json(disponibilidades);

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
    if (err.code === 11000) {
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
            index: e.index,
            code: e.code,
            message: e.errmsg,
            failedDocumentPreview: e.err.op ? { dni: e.err.op.dni, dia: e.err.op.dia, franja: e.err.op.franja } : "No disponible"
          }))
        : { generalMessage: err.message, code: err.code };
      return res.status(400).json({
        message: "Error durante la carga masiva de disponibilidad. Algunos registros podrían no haberse insertado (posiblemente duplicados).",
        details: errorDetails
      });
    }
    res.status(500).json({ message: "Error interno del servidor durante la carga masiva: " + err.message });
  }
});

// --- RUTA DE MIGRACIÓN DE DATOS (USO ÚNICO) ---
// PATCH: /dni-to-string
// Convierte permanentemente todos los campos 'dni' de tipo numérico a string.
// ATENCIÓN: Llamar a esta ruta UNA SOLA VEZ para corregir los datos en la BD.
router.patch('/dni-to-string', async (req, res) => {
    try {
      // Busca todos los documentos donde 'dni' sea de tipo numérico (int, long, double, etc.)
      const docsToUpdate = await DisponibilidadAcompaniamiento.find({ 
        dni: { $type: ["int", "long", "double", "decimal"] } 
      });
  
      if (docsToUpdate.length === 0) {
        return res.status(200).json({ message: "No se encontraron DNIs para actualizar. Todos parecen ser strings ya." });
      }
  
      // Crea un array de operaciones de actualización para ejecutarlas en lote
      const bulkOps = docsToUpdate.map(doc => ({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { dni: String(doc.dni) } }
        }
      }));
  
      // Ejecuta la operación masiva
      const result = await DisponibilidadAcompaniamiento.bulkWrite(bulkOps);
  
      res.status(200).json({
        message: "Migración de DNI a string completada exitosamente.",
        documentosModificados: result.modifiedCount
      });
  
    } catch (err) {
      console.error("Error durante la migración de DNI a string:", err);
      res.status(500).json({ message: "Error interno del servidor durante la migración: " + err.message });
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
