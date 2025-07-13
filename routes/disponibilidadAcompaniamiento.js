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

// PUT: Actualizar disponibilidad de un especialista por DNI
router.put('/especialista/:dni', async (req, res) => {
  try {
    const { dni } = req.params;
    const updateData = req.body;

    // Validar que el DNI sea válido
    if (!dni || dni.trim() === '') {
      return res.status(400).json({ message: 'El DNI es requerido y no puede estar vacío' });
    }

    // Buscar la disponibilidad por DNI
    const disponibilidad = await DisponibilidadAcompaniamiento.findOne({ dni: dni.trim() });
    
    if (!disponibilidad) {
      return res.status(404).json({ 
        message: `No se encontró disponibilidad para el especialista con DNI: ${dni}` 
      });
    }

    // Actualizar los campos permitidos
    Object.assign(disponibilidad, updateData);

    // Guardar los cambios
    const disponibilidadActualizada = await disponibilidad.save();

    res.json({
      message: 'Disponibilidad actualizada exitosamente',
      data: disponibilidadActualizada
    });

  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ 
        message: "Error de validación al actualizar la disponibilidad", 
        errors 
      });
    }

    if (err.code === 11000) {
      return res.status(400).json({ 
        message: "Error: Ya existe un registro de disponibilidad con estos mismos datos (DNI, sede, día, franja, turno).",
        details: err.keyValue 
      });
    }

    console.error("Error al actualizar disponibilidad por DNI:", err);
    res.status(500).json({ 
      message: "Error interno del servidor al actualizar la disponibilidad: " + err.message 
    });
  }
});

// PUT: Actualizar múltiples disponibilidades de un especialista por DNI
router.put('/especialista/:dni/bulk', async (req, res) => {
  try {
    const { dni } = req.params;
    const updateData = req.body;

    // Validar que el DNI sea válido
    if (!dni || dni.trim() === '') {
      return res.status(400).json({ message: 'El DNI es requerido y no puede estar vacío' });
    }

    // Actualizar todas las disponibilidades del especialista
    const result = await DisponibilidadAcompaniamiento.updateMany(
      { dni: dni.trim() },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        message: `No se encontraron disponibilidades para el especialista con DNI: ${dni}` 
      });
    }

    res.json({
      message: 'Disponibilidades actualizadas exitosamente',
      registrosEncontrados: result.matchedCount,
      registrosActualizados: result.modifiedCount
    });

  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ 
        message: "Error de validación al actualizar las disponibilidades", 
        errors 
      });
    }

    console.error("Error al actualizar disponibilidades masivamente por DNI:", err);
    res.status(500).json({ 
      message: "Error interno del servidor al actualizar las disponibilidades: " + err.message 
    });
  }
});

// PATCH: Actualizar campos específicos de disponibilidad por DNI
router.patch('/especialista/:dni', async (req, res) => {
  try {
    const { dni } = req.params;
    const updateData = req.body;

    // Validar que el DNI sea válido
    if (!dni || dni.trim() === '') {
      return res.status(400).json({ message: 'El DNI es requerido y no puede estar vacío' });
    }

    // Validar que se envíen datos para actualizar
    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No se proporcionaron datos para actualizar' });
    }

    // Actualizar solo los campos proporcionados
    const disponibilidadActualizada = await DisponibilidadAcompaniamiento.findOneAndUpdate(
      { dni: dni.trim() },
      { $set: updateData },
      { 
        new: true, // Retornar el documento actualizado
        runValidators: true // Ejecutar validaciones del esquema
      }
    );

    if (!disponibilidadActualizada) {
      return res.status(404).json({ 
        message: `No se encontró disponibilidad para el especialista con DNI: ${dni}` 
      });
    }

    res.json({
      message: 'Disponibilidad actualizada exitosamente',
      data: disponibilidadActualizada
    });

  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ 
        message: "Error de validación al actualizar la disponibilidad", 
        errors 
      });
    }

    if (err.code === 11000) {
      return res.status(400).json({ 
        message: "Error: Ya existe un registro de disponibilidad con estos mismos datos (DNI, sede, día, franja, turno).",
        details: err.keyValue 
      });
    }

    console.error("Error al actualizar disponibilidad por DNI:", err);
    res.status(500).json({ 
      message: "Error interno del servidor al actualizar la disponibilidad: " + err.message 
    });
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

// PUT: Reemplazar completamente el calendario de disponibilidad de un especialista
router.put('/especialista/:dni/calendario', async (req, res) => {
  try {
    const { dni } = req.params;
    const nuevasDisponibilidades = req.body;

    // Validar DNI
    if (!dni || dni.trim() === '') {
      return res.status(400).json({ message: 'El DNI es requerido y no puede estar vacío' });
    }

    // Validar que sea un array
    if (!Array.isArray(nuevasDisponibilidades)) {
      return res.status(400).json({ message: 'El cuerpo debe ser un array de disponibilidades' });
    }

    // Validar que todas las disponibilidades tengan el mismo DNI
    const dniTrimmed = dni.trim();
    const invalidDni = nuevasDisponibilidades.some(disp => disp.dni !== dniTrimmed);
    if (invalidDni) {
      return res.status(400).json({ message: 'Todas las disponibilidades deben tener el mismo DNI del especialista' });
    }

    // 1. Eliminar todas las disponibilidades existentes del especialista
    const deleteResult = await DisponibilidadAcompaniamiento.deleteMany({ dni: dniTrimmed });
    
    // 2. Insertar las nuevas disponibilidades
    let resultadoInsercion = [];
    if (nuevasDisponibilidades.length > 0) {
      resultadoInsercion = await DisponibilidadAcompaniamiento.insertMany(
        nuevasDisponibilidades,
        { ordered: false }
      );
    }

    res.json({
      message: 'Calendario actualizado exitosamente',
      disponibilidadesEliminadas: deleteResult.deletedCount,
      disponibilidadesInsertadas: resultadoInsercion.length,
      nuevoCalendario: resultadoInsercion
    });

  } catch (err) {
    console.error("Error al actualizar calendario completo:", err);
    
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ 
        message: "Error de validación en el calendario", 
        errors 
      });
    }

    if (err.code === 11000) {
      return res.status(400).json({ 
        message: "Error: Hay horarios duplicados en el calendario (mismo día, franja y turno).",
        details: err.keyValue 
      });
    }

    if (err.name === 'MongoBulkWriteError') {
      const errorDetails = err.writeErrors
        ? err.writeErrors.map(e => ({
            index: e.index,
            code: e.code,
            message: e.errmsg
          }))
        : { generalMessage: err.message };
      
      return res.status(400).json({
        message: "Error durante la inserción del calendario. Algunos registros podrían no haberse insertado.",
        details: errorDetails
      });
    }

    res.status(500).json({ 
      message: "Error interno del servidor al actualizar el calendario: " + err.message 
    });
  }
});

// GET: Obtener calendario formateado de un especialista
router.get('/especialista/:dni/calendario', async (req, res) => {
  try {
    const { dni } = req.params;

    if (!dni || dni.trim() === '') {
      return res.status(400).json({ message: 'El DNI es requerido y no puede estar vacío' });
    }

    const disponibilidades = await DisponibilidadAcompaniamiento.find({ dni: dni.trim() })
      .sort({ dia: 1, franja: 1 })
      .lean();

    if (disponibilidades.length === 0) {
      return res.status(404).json({ 
        message: `No se encontró calendario para el especialista con DNI: ${dni}` 
      });
    }

    // Agrupar por día para facilitar la visualización en el frontend
    const calendarioAgrupado = disponibilidades.reduce((acc, disp) => {
      if (!acc[disp.dia]) {
        acc[disp.dia] = [];
      }
      acc[disp.dia].push(disp);
      return acc;
    }, {});

    res.json({
      especialista: {
        dni: dni.trim(),
        apellidosNombresCompletos: disponibilidades[0].apellidosNombresCompletos
      },
      calendario: calendarioAgrupado,
      disponibilidadesTotales: disponibilidades.length,
      disponibilidadesDetalle: disponibilidades
    });

  } catch (err) {
    console.error("Error al obtener calendario:", err);
    res.status(500).json({ 
      message: "Error interno del servidor al obtener el calendario: " + err.message 
    });
  }
});

module.exports = router;