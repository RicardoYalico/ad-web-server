const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ProgramacionHoraria = require('../models/ProgramacionHoraria'); // Modelo actualizado
const busboy = require('busboy');
const csv = require('csv-parser');

router.get('/reporte', async (req, res) => {
  try {
    // Usamos el framework de agregación de MongoDB a través del modelo de Mongoose.
    const reporte = await ProgramacionHoraria.aggregate([
      {
        // Etapa 1: Agrupar documentos por 'semestre' y 'fechaProgramacion'.
        $group: {
          _id: {
            semestre: "$semestre",
            fechaProgramacion: "$fechaProgramacion"
          },
          // Contar la cantidad de documentos en cada grupo.
          cantidad: { $sum: 1 },
          // Encontrar la fecha de actualización más reciente en cada grupo.
          ultimaActualizacion: { $max: "$updatedAt" }
        }
      },
      {
        // Etapa 2: Reestructurar el formato de salida para que sea más claro.
        $project: {
          _id: 0, // Omitimos el campo _id del resultado final.
          semestre: "$_id.semestre",
          fechaProgramacion: "$_id.fechaProgramacion",
          cantidad: "$cantidad",
          ultimaActualizacion: "$ultimaActualizacion"
        }
      },
      {
        // Etapa 3 (Opcional): Ordenar los resultados para una mejor visualización.
        $sort: {
          semestre: 1, // Ordena por semestre de forma ascendente.
          fechaProgramacion: 1 // Luego por fecha de programación.
        }
      }
    ]); // No se necesita .toArray() al usar el método .aggregate() del modelo Mongoose.

    res.json(reporte);
  } catch (err) {
    console.error('Error en la agregación:', err);
    res.status(500).json({ message: 'Error al generar el reporte', error: err });
  }
});

// GET: Obtener todos los registros con paginación y selección de campos
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query; // Valores por defecto para page y limit
    const query = {};

    // Mantener filtros si los necesitas (usando los nuevos nombres camelCase del modelo)
    // Estos nombres de req.query deben coincidir con lo que el cliente envía.
    // Si el cliente envía 'idDocente', esto está bien.
    // Si el cliente seguía enviando 'id_docente_asignado', necesitarías un mapeo aquí
    // o que el cliente actualice cómo envía los parámetros.
    // Asumiremos que el cliente ahora también usará camelCase para los query params.
    if (req.query.idDocente) { // Antes: req.query.id_docente_asignado
      query.idDocente = req.query.idDocente;
    }
    if (req.query.periodo) {
      query.periodo = req.query.periodo; // 'periodo' ya era compatible
    }
    if (req.query.nrc) {
      query.nrc = req.query.nrc; // 'nrc' ya era compatible
    }
    // Agrega más filtros según los necesites, usando los nombres camelCase del modelo
    // Ejemplo: if (req.query.codCurso) query.codCurso = req.query.codCurso;

    // Selección de campos (proyección) - el cliente debe enviar los campos en camelCase
    const selectFields = req.query.fields ? req.query.fields.split(',').join(' ') : '';

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      // sort: { createdAt: -1 } // Opcional: ejemplo de ordenamiento
      // select: selectFields, // Esta línea se maneja abajo con .select()
      lean: true
    };

    const docentesCargas = await ProgramacionHoraria.find(query)
      .select(selectFields)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .lean();

    const totalDocs = await ProgramacionHoraria.countDocuments(query);

    res.json({
      data: docentesCargas,
      totalPages: Math.ceil(totalDocs / options.limit),
      currentPage: options.page,
      totalDocs: totalDocs,
      limit: options.limit
    });

  } catch (err) {
    console.error("Error al obtener los registros:", err);
    res.status(500).json({ message: "Error al obtener los registros: " + err.message });
  }
});

// GET: Obtener un registro específico por su _id de MongoDB
router.get('/:id', getDocenteCarga, (req, res) => {
  // res.docenteCarga ya es un documento (o null) con campos camelCase
  res.json(res.docenteCarga);
});

// POST: Crear un nuevo registro individual
router.post('/', async (req, res) => {
  // Se asume que req.body ahora viene con claves en camelCase
  const docenteCarga = new Docente(req.body);

  try {
    const nuevoRegistro = await docenteCarga.save();
    res.status(201).json(nuevoRegistro); // nuevoRegistro tendrá campos camelCase
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      // Las claves en err.errors serán los nombres camelCase del modelo
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ message: "Error de validación al crear el registro", errors });
    }
    if (err.code === 11000) { // Error de clave duplicada
      // err.keyValue tendrá las claves camelCase del modelo que causaron el duplicado
      return res.status(400).json({
        message: "Error: Ya existe un registro con algunos de los datos únicos proporcionados.",
        details: err.keyValue
      });
    }
    console.error("Error al crear el registro:", err);
    res.status(400).json({ message: "Error al crear el registro: " + err.message });
  }
});

// POST: Crear múltiples registros (carga masiva)
router.post('/bulk', async (req, res) => {
  // El cuerpo (req.body) de la petición DEBE ser un array de objetos (un lote).
  const recordsToInsert = req.body;

  // Verificación básica de que el cuerpo es un array no vacío.
  if (!Array.isArray(recordsToInsert) || recordsToInsert.length === 0) {
    return res.status(400).json({ message: "El cuerpo de la solicitud debe ser un array de registros y no puede estar vacío." });
  }

  console.log(`Recibiendo un lote para insertar ${recordsToInsert.length} registros.`);

  try {
    // Insertamos el lote. 'ordered: false' intenta insertar todos los documentos
    // posibles, incluso si uno falla (ej. por duplicado).
    const result = await ProgramacionHoraria.insertMany(recordsToInsert, { ordered: false });
    res.status(201).json({
      message: `Lote procesado. Insertados exitosamente: ${result.length} de ${recordsToInsert.length} registros.`,
      insertedCount: result.length
    });
  } catch (err) {
    // Este bloque se ejecuta si hay errores. Por ejemplo, si un documento
    // duplicado causa un error, `err.writeErrors` contendrá los detalles.
    console.error("Error durante la inserción del lote:", err.message);

    const successfulInserts = err.result?.nInserted || 0;
    const failedCount = recordsToInsert.length - successfulInserts;

    res.status(400).json({
      message: `Error durante la inserción del lote. Insertados: ${successfulInserts}. Fallidos: ${failedCount}.`,
      details: err.writeErrors ? err.writeErrors.map(e => ({ index: e.index, code: e.code, error: e.errmsg })) : err.message,
    });
  }
});


// PUT: Actualizar un registro existente
router.put('/:id', getDocenteCarga, async (req, res) => {
  // Se asume que req.body viene con claves camelCase
  // res.docenteCarga es el documento Mongoose con campos camelCase
  Object.assign(res.docenteCarga, req.body);

  try {
    const registroActualizado = await res.docenteCarga.save();
    res.json(registroActualizado); // registroActualizado tendrá campos camelCase
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ message: "Error de validación al actualizar", errors });
    }
    if (err.code === 11000) {
      return res.status(400).json({ message: "Error de duplicado al actualizar.", details: err.keyValue });
    }
    console.error("Error al actualizar el registro:", err);
    res.status(400).json({ message: "Error al actualizar el registro: " + err.message });
  }
});

// DELETE: Eliminar un registro
// CORRECTO
// 1. Ruta específica con el texto "bulk"
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
      fechaProgramacion: fechaCarga
    };

    const result = await ProgramacionHoraria.deleteMany(filter);

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

// 2. Ruta genérica con un parámetro :id
router.delete('/:id', getDocenteCarga, async (req, res) => { 
  // ... tu código para eliminar un solo registro ...
});

// Middleware para obtener un registro por ID
async function getDocenteCarga(req, res, next) {
  let docenteCarga;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de registro no válido' });
    }
    docenteCarga = await Docente.findById(req.params.id); // Devuelve doc con campos camelCase
    if (docenteCarga == null) {
      return res.status(404).json({ message: 'No se pudo encontrar el registro con el ID proporcionado.' });
    }
  } catch (err) {
    console.error("Error en middleware getDocenteCarga:", err);
    return res.status(500).json({ message: "Error interno del servidor: " + err.message });
  }
  res.docenteCarga = docenteCarga;
  next();
}

module.exports = router;