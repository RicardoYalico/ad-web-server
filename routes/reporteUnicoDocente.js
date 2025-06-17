const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ReporteUnicoDocente = require('../models/ReporteUnicoDocente'); // Asegúrate que la ruta al modelo sea correcta

// --- RUTAS ESPECÍFICAS PRIMERO ---

// GET: Endpoint para generar un reporte agregado
// ¡MODIFICADO! Ahora agrupa por semestre y fechaCarga.
router.get('/reporte', async (req, res) => {
  try {
    const reporte = await ReporteUnicoDocente.aggregate([
      {
        // Etapa 1: Agrupar por semestre y fechaCarga.
        $group: {
          _id: {
            semestre: "$semestre",
            fechaCarga: "$fechaCarga"
          },
          // Contar la cantidad de docentes en cada grupo.
          cantidad: { $sum: 1 },
          // Encontrar la fecha de la última actualización en el grupo.
          ultimaActualizacion: { $max: "$updatedAt" }
        }
      },
      {
        // Etapa 2: Reestructurar la salida para que sea más legible.
        $project: {
          _id: 0,
          semestre: "$_id.semestre",
          fechaCarga: "$_id.fechaCarga",
          cantidad: "$cantidad",
          ultimaActualizacion: "$ultimaActualizacion"
        }
      },
      {
        // Etapa 3: Ordenar los resultados.
        $sort: {
          semestre: 1, 
          fechaCarga: 1
        }
      }
    ]);

    res.json(reporte);
  } catch (err) {
    console.error('Error al generar el reporte de docentes:', err);
    res.status(500).json({ message: 'Error al generar el reporte', error: err });
  }
});


// GET: Obtener todos los reportes con paginación, filtrado y selección de campos
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, fields } = req.query; 
    const query = {};

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
      query.sedeDictado = new RegExp(req.query.sedeDictado, 'i');
    }
    if (req.query.facultad) {
      query.facultad = new RegExp(req.query.facultad, 'i');
    }
     if (req.query.carrera) {
      query.carrera = new RegExp(req.query.carrera, 'i');
    }

    const selectFields = fields ? fields.split(',').join(' ') : '';
    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      lean: true 
    };

    let reportesQuery = ReporteUnicoDocente.find(query);

    if (selectFields) {
      reportesQuery = reportesQuery.select(selectFields);
    }

    reportesQuery = reportesQuery
      .limit(options.limit)
      .skip((options.page - 1) * options.limit);

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

// POST: Crear un nuevo reporte de docente individual
router.post('/', async (req, res) => {
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
    if (err.code === 11000) { 
      return res.status(409).json({
        message: "Error: Ya existe un registro con algunos de los datos únicos proporcionados.",
        details: err.keyValue
      });
    }
    console.error("Error al crear el reporte de docente:", err);
    res.status(400).json({ message: "Error al crear el reporte de docente: " + err.message });
  }
});

// POST: Crear múltiples reportes (carga masiva)
router.post('/bulk', async (req, res) => {
  const recordsToInsert = req.body;

  if (!Array.isArray(recordsToInsert) || recordsToInsert.length === 0) {
    return res.status(400).json({ message: "El cuerpo de la solicitud debe ser un array de reportes y no puede estar vacío." });
  }

  try {
    const result = await ReporteUnicoDocente.insertMany(recordsToInsert, { ordered: false});
    res.status(201).json({
      message: `Carga masiva completada. ${result.length} reportes fueron insertados exitosamente.`,
      insertedCount: result.length,
      data: result 
    });
  } catch (err) {
    console.error("Error en carga masiva de reportes de docentes:", err);
    if (err.name === 'MongoBulkWriteError' || (err.code === 11000 && err.writeErrors)) {
      const errorDetails = err.writeErrors
        ? err.writeErrors.map(e => ({
            index: e.index,
            code: e.code,
            message: e.errmsg,
            failedDocumentPreview: e.err && e.err.op ? { dni: e.err.op.dni, codigoColaborador: e.err.op.codigoColaborador } : undefined
          }))
        : { generalMessage: err.message, code: err.code, details: err.keyValue };

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


// --- RUTAS GENÉRICAS (CON PARÁMETROS) DESPUÉS ---

// GET: Obtener un reporte de docente específico por su _id de MongoDB
router.get('/:id', getReporteDocente, (req, res) => {
  res.json(res.reporteDocente);
});

// PUT: Actualizar un reporte de docente existente
router.put('/:id', getReporteDocente, async (req, res) => {
  Object.assign(res.reporteDocente, req.body); 

  try {
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
    if (err.code === 11000) {
      return res.status(409).json({ 
          message: "Error: Intento de actualizar a un valor que viola una restricción única.",
          details: err.keyValue
      });
    }
    console.error("Error al actualizar el reporte de docente:", err);
    res.status(400).json({ message: "Error al actualizar el reporte de docente: " + err.message });
  }
});

// DELETE: Eliminar por lote
// ¡MODIFICADO! Ahora elimina usando 'semestre' y 'fechaCarga'.
router.delete('/bulk', async (req, res) => {
  const { semestre, fechaCarga } = req.body;

  if (!semestre || !fechaCarga) {
    return res.status(400).json({
      message: 'Los campos "semestre" y "fechaCarga" son requeridos.'
    });
  }
  
  try {
    const filter = {
      semestre: semestre,
      fechaCarga: fechaCarga
    };

    const result = await ReporteUnicoDocente.deleteMany(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: `No se encontraron reportes para eliminar con los criterios proporcionados.`,
        deletedCount: result.deletedCount,
      });
    }

    res.status(200).json({
      message: `Se eliminaron ${result.deletedCount} reportes.`,
      deletedCount: result.deletedCount,
    });

  } catch (err) {
    res.status(500).json({ 
        message: "Error interno del servidor durante la eliminación masiva.",
        error: err.message 
    });
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

// --- MIDDLEWARE ---

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
  res.reporteDocente = reporte; 
  next();
}

module.exports = router;
