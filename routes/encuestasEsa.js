const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const EncuestaEsa = require('../models/EncuestaEsa'); // Asegúrate que la ruta al modelo es correcta

// --- RUTAS ESPECÍFICAS PRIMERO ---

// GET: Endpoint para generar un reporte agregado
// ¡MODIFICADO! La lógica de agregación ahora agrupa por semestre y fecha de carga.
router.get('/reporte', async (req, res) => {
  try {
    const reporte = await EncuestaEsa.aggregate([
      {
        // Etapa 1: Agrupar documentos por 'semestre' y 'fechaCarga'.
        // Asegúrate que tu modelo 'EncuestaEsa' tiene los campos 'semestre' y 'fechaCarga'.
        $group: {
          _id: {
            semestre: "$semestre",
            fechaCarga: "$fechaCarga" 
          },
          // Contar la cantidad de documentos en cada grupo.
          cantidad: { $sum: 1 },
          // Encontrar la fecha de actualización más reciente en el grupo.
          ultimaActualizacion: { $max: "$updatedAt" }
        }
      },
      {
        // Etapa 2: Reestructurar el formato de salida para que sea más claro.
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
          semestre: 1, // Orden ascendente por semestre
          fechaCarga: 1  // Luego por fecha de carga
        }
      }
    ]);

    res.json(reporte);
  } catch (err) {
    console.error('Error al generar el reporte de encuestas:', err);
    res.status(500).json({ message: 'Error al generar el reporte', error: err });
  }
});


// GET: Obtener todos los registros de encuestas ESA con paginación
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, dni, campus, codBanner } = req.query;
    const query = {};

    if (dni) query.dni = dni;
    if (campus) query.campus = campus;
    if (codBanner) query.codBanner = codBanner;

    const selectFields = req.query.fields ? req.query.fields.split(',').join(' ') : '';
    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      lean: true,
      sort: { createdAt: -1 }
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

// POST: Crear un nuevo registro de encuesta ESA individual
router.post('/', async (req, res) => {
  const encuesta = new EncuestaEsa(req.body);

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
router.post('/bulk', async (req, res) => {
  const recordsToInsert = req.body;

  if (!Array.isArray(recordsToInsert) || recordsToInsert.length === 0) {
    return res.status(400).json({ message: "El cuerpo de la solicitud debe ser un array de registros y no puede estar vacío." });
  }

  try {
    const result = await EncuestaEsa.insertMany(recordsToInsert, { ordered: false });
    res.status(201).json({
      message: `Lote procesado. Insertados exitosamente: ${result.length} de ${recordsToInsert.length} registros.`,
      insertedCount: result.length,
    });
  } catch (err) {
    console.error("Error en carga masiva de encuestas ESA:", err);
    const successfulInserts = err.result?.nInserted || 0;
    const failedCount = recordsToInsert.length - successfulInserts;

    res.status(400).json({
      message: `Error durante la inserción del lote. Insertados: ${successfulInserts}. Fallidos: ${failedCount}.`,
      details: err.writeErrors ? err.writeErrors.map(e => ({ index: e.index, code: e.code, error: e.errmsg })) : err.message,
    });
  }
});


// --- RUTAS GENÉRICAS (CON PARÁMETROS) DESPUÉS ---

// GET: Obtener una encuesta ESA específica por su _id
router.get('/:id', getEncuestaEsa, (req, res) => {
  res.json(res.encuestaEsa);
});


// PUT: Actualizar un registro de encuesta ESA existente
router.put('/:id', getEncuestaEsa, async (req, res) => {
  Object.assign(res.encuestaEsa, req.body);

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

    const result = await EncuestaEsa.deleteMany(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: `No se encontraron registros para eliminar.`,
        deletedCount: result.deletedCount,
      });
    }

    res.status(200).json({
      message: `Se eliminaron ${result.deletedCount} registros.`,
      deletedCount: result.deletedCount,
    });

  } catch (err) {
    res.status(500).json({ 
        message: "Error interno del servidor.",
        error: err.message 
    });
  }
});


// DELETE: Eliminar un registro de encuesta ESA por ID
router.delete('/:id', getEncuestaEsa, async (req, res) => {
  try {
    await res.encuestaEsa.deleteOne();
    res.json({ message: 'Encuesta ESA eliminada exitosamente' });
  } catch (err) {
    console.error("Error al eliminar la encuesta ESA:", err);
    res.status(500).json({ message: "Error al eliminar la encuesta ESA: " + err.message });
  }
});


// --- MIDDLEWARE ---

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

module.exports = router;
