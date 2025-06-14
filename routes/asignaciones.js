const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Asignaciones = require('../models/Asignaciones'); // Asegúrate de que el modelo esté correctamente importado

// GET: Listar con filtros y paginación
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 5000 } = req.query;
    const query = {};

    if (req.query.periodo) query.periodo = req.query.periodo;
    if (req.query.nombreCurso) query.nombreCurso = req.query.nombreCurso;
    if (req.query.idDocente) query.idDocente = req.query.idDocente;
    if (req.query.docente) query.docente = req.query.docente;
    if (req.query.rolColaborador) query.rolColaborador = req.query.rolColaborador;
    if (req.query.programa) query.programa = req.query.programa;
    if (req.query.modalidad) query.modalidad = req.query.modalidad;

    const selectFields = req.query.fields ? req.query.fields.split(',').join(' ') : '';

    const opciones = {
      page: parseInt(page),
      limit: parseInt(limit),
      lean: true
    };

    const registros = await Asignaciones.find(query)
      .select(selectFields)
      .limit(opciones.limit)
      .skip((opciones.page - 1) * opciones.limit)
      .lean();

    const totalDocs = await Asignaciones.countDocuments(query);

    res.json({
      data: registros,
      totalPages: Math.ceil(totalDocs / opciones.limit),
      currentPage: opciones.page,
      totalDocs,
      limit: opciones.limit
    });
  } catch (err) {
    console.error("Error al obtener registros:", err);
    res.status(500).json({ message: "Error al obtener registros: " + err.message });
  }
});

// GET: Obtener por ID
router.get('/:id', getRegistro, (req, res) => {
  res.json(res.registro);
});

// POST: Crear nuevo
router.post('/', async (req, res) => {
  const registro = new Asignaciones(req.body);
  try {
    const nuevo = await registro.save();
    res.status(201).json(nuevo);
  } catch (err) {
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
    const result = await Asignaciones.insertMany(registros, { ordered: false });
    res.status(201).json({
      message: `${result.length} registros insertados.`,
      insertedCount: result.length
    });
  } catch (err) {
    console.error("Error en carga masiva:", err);
    res.status(500).json({ message: "Error interno: " + err.message });
  }
});

// PUT: Actualizar por ID
router.put('/:id', getRegistro, async (req, res) => {
  Object.assign(res.registro, req.body);
  try {
    const actualizado = await res.registro.save();
    res.json(actualizado);
  } catch (err) {
    console.error("Error al actualizar:", err);
    res.status(400).json({ message: "Error al actualizar: " + err.message });
  }
});

// DELETE: Eliminar por ID
router.delete('/:id', getRegistro, async (req, res) => {
  try {
    await res.registro.deleteOne();
    res.json({ message: 'Registro eliminado' });
  } catch (err) {
    console.error("Error al eliminar:", err);
    res.status(500).json({ message: "Error al eliminar: " + err.message });
  }
});

// Middleware para obtener registro por ID
async function getRegistro(req, res, next) {
  let registro;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID no válido' });
    }
    registro = await Asignaciones.findById(req.params.id);
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
