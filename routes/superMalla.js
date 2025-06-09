const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ProgramacionHoraria = require('../models/SuperMalla'); // modelo actualizado

// GET: Obtener registros con paginación, filtros y selección de campos
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const query = {};

    // Filtros disponibles según nuevos campos camelCase
    if (req.query.facultad) query.facultad = req.query.facultad;
    if (req.query.unidNegocio) query.unidNegocio = req.query.unidNegocio;
    if (req.query.modaliadDeLaCarrera) query.modaliadDeLaCarrera = req.query.modaliadDeLaCarrera;
    if (req.query.malla) query.malla = req.query.malla;
    if (req.query.carerra) query.carerra = req.query.carerra;
    if (req.query.ciclo) query.ciclo = req.query.ciclo;
    if (req.query.codigoOficial) query.codigoOficial = req.query.codigoOficial;
    if (req.query.curso) query.curso = req.query.curso;
    if (req.query.categoriaDelCurso) query.categoriaDelCurso = req.query.categoriaDelCurso;
    if (req.query.tipoDeEstudios) query.tipoDeEstudios = req.query.tipoDeEstudios;
    if (req.query.modalidadCurso) query.modalidadCurso = req.query.modalidadCurso;
    if (req.query.tipoDeCurso) query.tipoDeCurso = req.query.tipoDeCurso;

    const selectFields = req.query.fields ? req.query.fields.split(',').join(' ') : '';

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      lean: true
    };

    const registros = await ProgramacionHoraria.find(query)
      .select(selectFields)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .lean();

    const totalDocs = await ProgramacionHoraria.countDocuments(query);

    res.json({
      data: registros,
      totalPages: Math.ceil(totalDocs / options.limit),
      currentPage: options.page,
      totalDocs: totalDocs,
      limit: options.limit
    });

  } catch (err) {
    console.error("Error al obtener registros:", err);
    res.status(500).json({ message: "Error al obtener registros: " + err.message });
  }
});

// GET: Obtener un registro por _id
router.get('/:id', getRegistro, (req, res) => {
  res.json(res.registro);
});

// POST: Crear un nuevo registro
router.post('/', async (req, res) => {
  const registro = new ProgramacionHoraria(req.body);
  try {
    const nuevo = await registro.save();
    res.status(201).json(nuevo);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const errors = {};
      Object.keys(err.errors).forEach(key => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ message: "Error de validación", errors });
    }
    if (err.code === 11000) {
      return res.status(400).json({ message: "Registro duplicado.", details: err.keyValue });
    }
    console.error("Error al crear registro:", err);
    res.status(400).json({ message: "Error al crear registro: " + err.message });
  }
});

// POST: Carga masiva
router.post('/bulk', async (req, res) => {
  const registros = req.body;
  if (!Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ message: "El cuerpo debe ser un array de registros." });
  }
  try {
    const result = await ProgramacionHoraria.insertMany(registros, { ordered: false });
    res.status(201).json({
      message: `${result.length} registros insertados.`,
      insertedCount: result.length
    });
  } catch (err) {
    console.error("Error en carga masiva:", err);
    if (err.name === 'MongoBulkWriteError' || err.code === 11000) {
      const details = err.writeErrors
        ? err.writeErrors.map(e => ({
          index: e.index,
          message: e.errmsg,
          failed: e.err.op
        }))
        : { message: err.message };
      return res.status(400).json({
        message: "Error durante carga masiva.",
        details
      });
    }
    res.status(500).json({ message: "Error interno: " + err.message });
  }
});

// PUT: Actualizar un registro
router.put('/:id', getRegistro, async (req, res) => {
  Object.assign(res.registro, req.body);
  try {
    const actualizado = await res.registro.save();
    res.json(actualizado);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const errors = {};
      Object.keys(err.errors).forEach(key => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ message: "Error de validación", errors });
    }
    if (err.code === 11000) {
      return res.status(400).json({ message: "Error de duplicado", details: err.keyValue });
    }
    console.error("Error al actualizar:", err);
    res.status(400).json({ message: "Error al actualizar: " + err.message });
  }
});

// DELETE: Eliminar registro
router.delete('/:id', getRegistro, async (req, res) => {
  try {
    await res.registro.deleteOne();
    res.json({ message: 'Registro eliminado' });
  } catch (err) {
    console.error("Error al eliminar:", err);
    res.status(500).json({ message: "Error al eliminar: " + err.message });
  }
});

// Middleware obtener registro por ID
async function getRegistro(req, res, next) {
  let registro;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID no válido' });
    }
    registro = await ProgramacionHoraria.findById(req.params.id);
    if (!registro) {
      return res.status(404).json({ message: 'Registro no encontrado' });
    }
  } catch (err) {
    console.error("Error en getRegistro:", err);
    return res.status(500).json({ message: "Error: " + err.message });
  }
  res.registro = registro;
  next();
}

module.exports = router;
