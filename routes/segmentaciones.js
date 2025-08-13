const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Segmentacion = require('../models/Segmentacion');


// ✅ GET: Obtener planes con filtros mejorados
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 100,
    } = req.query;
    
    const query = {};
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [segmentos, total] = await Promise.all([
      Segmentacion.find(query)
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      Segmentacion.countDocuments(query)
    ]);
    
    res.json({
      data: segmentos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalDocs: total,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      }
    });
    
  } catch (err) {
    console.error("Error al obtener los planes:", err);
    res.status(500).json({ 
      message: "Error al obtener los planes", 
      error: err.message 
    });
  }
});

// ✅ POST: Crear un nuevo reporte individual
router.post('/', async (req, res) => {
  const segmentacion = new Segmentacion(req.body);
  try {
    const nuevoSegmento = await segmentacion.save();
    res.status(201).json(nuevoSegmento);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ 
        message: "Error de validación al crear la segmentación.", 
        errors 
      });
    }
    if (err.code === 11000) { 
      return res.status(409).json({
        message: "Error: Ya existe un registro con algunos de los datos únicos proporcionados.",
        details: err.keyValue
      });
    }
    console.error("Error al crear la segmentación:", err);
    res.status(400).json({ 
      message: "Error al crear la segmentación: " + err.message 
    });
  }
});


// ✅ DELETE: Eliminar reporte individual
router.delete('/:id', getSegmentacion, async (req, res) => {
  try {
    await res.segmentacion.deleteOne();
    res.json({ message: 'Segmentación eliminada exitosamente' });
  } catch (err) {
    console.error("Error al eliminar la segmentación:", err);
    res.status(500).json({ 
      message: "Error al eliminar la segmentación: " + err.message 
    });
  }
});


// ✅ PUT: Actualizar reporte individual
router.put('/:id', getSegmentacion, async (req, res) => {
  Object.assign(res.segmentacion, req.body);
  try {
    const segmentoActualizado = await res.segmentacion.save({ runValidators: true });
    res.json(segmentoActualizado);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ 
        message: "Error de validación al actualizar la segmentación.", 
        errors 
      });
    }
    if (err.code === 11000) {
      return res.status(409).json({ 
        message: "Error: Intento de actualizar a un valor que viola una restricción única.",
        details: err.keyValue
      });
    }
    console.error("Error al actualizar la segmentación:", err);
    res.status(400).json({ 
      message: "Error al actualizar la segmentación: " + err.message 
    });
  }
});



// ✅ Middleware para operaciones individuales
async function getSegmentacion(req, res, next) {
  let segmentacion;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de segmentación no válido' });
    }

    segmentacion = await Segmentacion.findById(req.params.id);

    if (segmentacion == null) {
      return res.status(404).json({ 
        message: 'No se pudo encontrar la segmentación con el ID proporcionado.' 
      });
    }
  } catch (err) {
    console.error("Error en middleware getSegmentacion:", err);
    return res.status(500).json({ 
      message: "Error interno del servidor: " + err.message 
    });
  }
  
  res.segmentacion = segmentacion;
  next();
}


module.exports = router;