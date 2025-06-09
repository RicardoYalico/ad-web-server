// routes/reporteDocenteRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ReporteUnicoDocente = require('../models/ReporteUnicoDocente'); // Asegúrate que la ruta al modelo sea correcta

// Middleware para obtener un reporte de docente por ID y adjuntarlo a la solicitud
async function getReporteDocente(req, res, next) {
  let reporte;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de reporte no válido.' });
    }
    reporte = await ReporteUnicoDocente.findById(req.params.id);
    if (reporte == null) {
      return res.status(404).json({ message: 'No se pudo encontrar el reporte de docente con el ID proporcionado.' });
    }
  } catch (err) {
    console.error("Error en middleware getReporteDocente:", err);
    return res.status(500).json({ message: "Error interno del servidor: " + err.message });
  }
  res.reporteDocente = reporte; // Adjuntamos el reporte encontrado al objeto res
  next();
}

// GET: Obtener todos los reportes con paginación, filtrado y selección de campos
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, fields } = req.query; // Valores por defecto para page y limit
    const query = {};

    // Aplicar filtros basados en los query params (usando campos del modelo ReporteUnicoDocente)
    // Estos deben coincidir con lo que el cliente envía y con los campos del modelo (camelCase)
    if (req.query.dni) {
      query.dni = req.query.dni;
    }
    if (req.query.codigoColaborador) {
      query.codigoColaborador = req.query.codigoColaborador;
    }
    if (req.query.codigoBanner) {
      query.codigoBanner = req.query.codigoBanner;
    }
    if (req.query.sedeDictado) {
      // Ejemplo de búsqueda insensible a mayúsculas/minúsculas para strings
      query.sedeDictado = new RegExp(req.query.sedeDictado, 'i');
    }
    if (req.query.facultad) {
      query.facultad = new RegExp(req.query.facultad, 'i');
    }
    if (req.query.carrera) {
        query.carrera = new RegExp(req.query.carrera, 'i');
    }
    // Agrega más filtros según necesites:
    // if (req.query.rol2025_1) query.rol2025_1 = req.query.rol2025_1;

    // Selección de campos (proyección)
    const selectFields = fields ? fields.split(',').join(' ') : '';

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      lean: true // Devuelve POJOs en lugar de documentos Mongoose para mejor rendimiento en lecturas
    };

    // Construcción de la consulta
    let reportesQuery = ReporteUnicoDocente.find(query);

    if (selectFields) {
      reportesQuery = reportesQuery.select(selectFields);
    }

    reportesQuery = reportesQuery
      .limit(options.limit)
      .skip((options.page - 1) * options.limit);
      // .sort({ createdAt: -1 }); // Opcional: ejemplo de ordenamiento

    const reportes = await reportesQuery.exec();
    const totalDocs = await ReporteUnicoDocente.countDocuments(query);

    res.json({
      data: reportes,
      totalPages: Math.ceil(totalDocs / options.limit),
      currentPage: options.page,
      totalDocs: totalDocs,
      limit: options.limit
    });

  } catch (err) {
    console.error("Error al obtener los reportes de docentes:", err);
    res.status(500).json({ message: "Error al obtener los reportes de docentes: " + err.message });
  }
});

// GET: Obtener un reporte de docente específico por su _id de MongoDB
router.get('/:id', getReporteDocente, (req, res) => {
  // res.reporteDocente es el documento Mongoose adjuntado por el middleware
  res.json(res.reporteDocente);
});

// POST: Crear un nuevo reporte de docente individual
router.post('/', async (req, res) => {
  // Se asume que req.body viene con claves en camelCase correspondientes al modelo
  const reporte = new ReporteUnicoDocente(req.body);

  try {
    const nuevoReporte = await reporte.save();
    res.status(201).json(nuevoReporte);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ message: "Error de validación al crear el reporte.", errors });
    }
    if (err.code === 11000) { // Error de clave duplicada (ej. DNI único)
      return res.status(409).json({ // 409 Conflict
        message: "Error: Ya existe un registro con algunos de los datos únicos proporcionados.",
        details: err.keyValue // Muestra qué campo(s) causaron el conflicto
      });
    }
    console.error("Error al crear el reporte de docente:", err);
    res.status(400).json({ message: "Error al crear el reporte de docente: " + err.message });
  }
});

// POST: Crear múltiples reportes (carga masiva)
router.post('/bulk', async (req, res) => {
  const recordsToInsert = req.body; // Se espera un array de objetos

  if (!Array.isArray(recordsToInsert) || recordsToInsert.length === 0) {
    return res.status(400).json({ message: "El cuerpo de la solicitud debe ser un array de reportes y no puede estar vacío." });
  }

  try {
    // { ordered: false } permite que Mongoose intente insertar todos los documentos,
    // incluso si algunos fallan, y reporta todos los errores al final.
    const result = await ReporteUnicoDocente.insertMany(recordsToInsert, { ordered: false, lean: true });
    res.status(201).json({
      message: `Carga masiva completada. ${result.length} reportes fueron insertados exitosamente.`,
      insertedCount: result.length,
      data: result // Documentos insertados
    });
  } catch (err) {
    console.error("Error en carga masiva de reportes de docentes:", err);
    if (err.name === 'MongoBulkWriteError' || (err.code === 11000 && err.writeErrors)) {
      const errorDetails = err.writeErrors
        ? err.writeErrors.map(e => ({
            index: e.index,
            code: e.code,
            message: e.errmsg,
            // El documento que falló está en e.err.op (o e.op en versiones más nuevas de MongoDB driver)
            failedDocumentPreview: e.err && e.err.op ? { dni: e.err.op.dni, codigoColaborador: e.err.op.codigoColaborador } : undefined
          }))
        : { generalMessage: err.message, code: err.code, details: err.keyValue };

      // A pesar del error, algunos documentos pudieron haberse insertado si ordered:false
      // err.result.nInserted podría darte esa cuenta
      const insertedCount = err.result && err.result.result ? err.result.result.nInserted : 0;

      return res.status(400).json({
        message: `Error durante la carga masiva. ${insertedCount} reportes pudieron haberse insertado. Algunos reportes no se pudieron insertar.`,
        insertedCount: insertedCount,
        errors: errorDetails
      });
    }
    res.status(500).json({ message: "Error interno del servidor durante la carga masiva: " + err.message });
  }
});


// PUT: Actualizar un reporte de docente existente
router.put('/:id', getReporteDocente, async (req, res) => {
  // res.reporteDocente es el documento Mongoose obtenido por el middleware
  // Se asume que req.body viene con claves camelCase
  // Object.assign(target, ...sources) copia propiedades de sources a target.
  Object.assign(res.reporteDocente, req.body);

  try {
    // runValidators: true asegura que las validaciones del schema se ejecuten al actualizar
    const reporteActualizado = await res.reporteDocente.save({ runValidators: true });
    res.json(reporteActualizado);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ message: "Error de validación al actualizar el reporte.", errors });
    }
    if (err.code === 11000) { // Error de clave duplicada
      return res.status(409).json({ // 409 Conflict
          message: "Error: Intento de actualizar a un valor que viola una restricción única.",
          details: err.keyValue
      });
    }
    console.error("Error al actualizar el reporte de docente:", err);
    res.status(400).json({ message: "Error al actualizar el reporte de docente: " + err.message });
  }
});

// DELETE: Eliminar un reporte de docente
router.delete('/:id', getReporteDocente, async (req, res) => {
  try {
    await res.reporteDocente.deleteOne();
    res.json({ message: 'Reporte de docente eliminado exitosamente.' });
  } catch (err) {
    console.error("Error al eliminar el reporte de docente:", err);
    res.status(500).json({ message: "Error al eliminar el reporte de docente: " + err.message });
  }
});

module.exports = router;