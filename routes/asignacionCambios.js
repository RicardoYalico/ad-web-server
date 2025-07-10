const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AsignacionCambio = require('../models/AsignacionCambio'); // Importar el nuevo modelo

// GET: Listar con filtros y paginación
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query; // Límite por defecto más manejable
    const query = {};

    // Filtros para campos de nivel superior
    if (req.query.semestre) query.semestre = req.query.semestre;
    if (req.query.idDocente) query.idDocente = req.query.idDocente;
    if (req.query.tipoCambio) query.tipoCambio = req.query.tipoCambio;
    
    // Filtro de búsqueda por nombre de docente (insensible a mayúsculas)
    if (req.query.docente) {
      query.docente = { $regex: req.query.docente, $options: 'i' };
    }

    // Filtros para campos anidados (usando dot-notation)
    if (req.query.programa) query['asignacionNueva.programa'] = req.query.programa;
    if (req.query.modalidad) query['asignacionNueva.modalidad'] = req.query.modalidad;
    if (req.query.codCurso) query['asignacionNueva.cursos.codCurso'] = req.query.codCurso;

    const selectFields = req.query.fields ? req.query.fields.split(',').join(' ') : '';

    const opciones = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      lean: true // Usa lean para un mejor rendimiento en lecturas
    };

    const registros = await AsignacionCambio.find(query)
      .select(selectFields)
      .sort({ fechaDeteccion: -1 }) // Ordenar por fecha de detección descendente
      .limit(opciones.limit)
      .skip((opciones.page - 1) * opciones.limit)
      .lean();

    const totalDocs = await AsignacionCambio.countDocuments(query);

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

// GET: Obtener un registro por su ID
router.get('/:id', getRegistro, (req, res) => {
  res.json(res.registro);
});

// POST: Crear un nuevo registro
router.post('/', async (req, res) => {
  const registro = new AsignacionCambio(req.body);
  try {
    const nuevoRegistro = await registro.save();
    res.status(201).json(nuevoRegistro);
  } catch (err) {
    console.error("Error al crear registro:", err);
    res.status(400).json({ message: "Error al crear registro: " + err.message });
  }
});

// POST: Carga masiva de registros
router.post('/bulk', async (req, res) => {
  const registros = req.body;
  if (!Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ message: "El cuerpo de la petición debe ser un array de registros." });
  }
  try {
    const result = await AsignacionCambio.insertMany(registros, { ordered: false });
    res.status(201).json({
      message: `${result.length} registros insertados.`,
      insertedCount: result.length
    });
  } catch (err) {
    console.error("Error en carga masiva:", err);
    // Devuelve más detalles si es un error de validación o duplicado
    if (err.writeErrors) {
        return res.status(400).json({ 
            message: "Algunos registros no se pudieron insertar.",
            errors: err.writeErrors 
        });
    }
    res.status(500).json({ message: "Error interno del servidor: " + err.message });
  }
});

// PUT: Actualizar un registro por ID
router.put('/:id', getRegistro, async (req, res) => {
  // Evitar que se modifiquen campos inmutables como el ID o la fecha de creación
  delete req.body._id;
  delete req.body.createdAt;

  Object.assign(res.registro, req.body);
  try {
    const registroActualizado = await res.registro.save();
    res.json(registroActualizado);
  } catch (err) {
    console.error("Error al actualizar:", err);
    res.status(400).json({ message: "Error al actualizar: " + err.message });
  }
});

// DELETE: Eliminar un registro por ID
router.delete('/:id', getRegistro, async (req, res) => {
  try {
    await res.registro.deleteOne();
    res.json({ message: 'Registro eliminado correctamente' });
  } catch (err) {
    console.error("Error al eliminar:", err);
    res.status(500).json({ message: "Error al eliminar el registro: " + err.message });
  }
});

// Middleware para obtener un registro por ID y adjuntarlo a la petición (req)
async function getRegistro(req, res, next) {
  let registro;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'El ID proporcionado no es válido' });
    }
    registro = await AsignacionCambio.findById(req.params.id);
    if (!registro) {
      return res.status(404).json({ message: 'Registro no encontrado' });
    }
  } catch (err) {
    console.error("Error en middleware getRegistro:", err);
    return res.status(500).json({ message: "Error del servidor: " + err.message });
  }
  res.registro = registro;
  next();
}

module.exports = router;