// routes/docentes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Docente = require('../models/ProgramacionHoraria'); // El modelo ahora usa camelCase

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

    const docentesCargas = await Docente.find(query)
      .select(selectFields)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .lean();

    const totalDocs = await Docente.countDocuments(query);

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
  // Se asume que req.body es un array de objetos, cada uno con claves en camelCase
  const recordsToInsert = req.body;

  if (!Array.isArray(recordsToInsert) || recordsToInsert.length === 0) {
    return res.status(400).json({ message: "El cuerpo de la solicitud debe ser un array de registros y no puede estar vacío." });
  }

  try {
    // Mongoose validará usando el schema con campos camelCase
    const result = await Docente.insertMany(recordsToInsert, { ordered: false });
    res.status(201).json({
      message: `${result.length} registros intentados para inserción.`,
      insertedCount: result.length,
      // 'result' es un array de los documentos insertados, con campos camelCase
    });
  } catch (err) {
    console.error("Error en carga masiva:", err);
    if (err.name === 'MongoBulkWriteError' || err.code === 11000) {
      const errorDetails = err.writeErrors
        ? err.writeErrors.map(e => ({
            index: e.index,
            code: e.code,
            message: e.errmsg,
            // e.err.op contiene el documento que falló, con campos camelCase
            failedDocumentPreview: e.err.op ? { nrc: e.err.op.nrc, idDocente: e.err.op.idDocente } : undefined
          }))
        : { generalMessage: err.message, code: err.code };
      return res.status(400).json({
        message: "Error durante la carga masiva. Algunos registros podrían no haberse insertado.",
        details: errorDetails
      });
    }
    res.status(500).json({ message: "Error interno del servidor durante la carga masiva: " + err.message });
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
router.delete('/:id', getDocenteCarga, async (req, res) => {
  try {
    await res.docenteCarga.deleteOne();
    res.json({ message: 'Registro eliminado exitosamente' });
  } catch (err) {
    console.error("Error al eliminar el registro:", err);
    res.status(500).json({ message: "Error al eliminar el registro: " + err.message });
  }
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