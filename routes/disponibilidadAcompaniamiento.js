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
    
    // Filtros para el array de disponibilidades
    const disponibilidadesFilter = {};
    if (sede) disponibilidadesFilter['disponibilidades.sede1DePreferenciaPresencial'] = { $regex: sede, $options: "i" };
    if (dia) disponibilidadesFilter['disponibilidades.dia'] = { $regex: dia, $options: "i" };
    if (turno) disponibilidadesFilter['disponibilidades.turno'] = { $regex: turno, $options: "i" };
    
    // Combinar filtros
    Object.assign(query, disponibilidadesFilter);
    
    const selectFields = req.query.fields ? req.query.fields.split(',').join(' ') : '';
    const sortOptions = { apellidosNombresCompletos: 1, 'disponibilidades.dia': 1, 'disponibilidades.franja': 1 };
    
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

// POST: Crear un nuevo registro de disponibilidad
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
        message: "Error: Ya existe un registro de disponibilidad con estos mismos datos.",
        details: err.keyValue
      });
    }
    console.error("Error al crear la disponibilidad:", err);
    res.status(400).json({ message: "Error al crear la disponibilidad: " + err.message });
  }
});

// POST: Crear múltiples registros de disponibilidad (carga masiva con limpieza previa)
router.post('/bulk', async (req, res) => {
  const recordsToInsert = req.body;
  if (!Array.isArray(recordsToInsert) || recordsToInsert.length === 0) {
    return res.status(400).json({ message: "El cuerpo de la solicitud debe ser un array de registros y no puede estar vacío." });
  }
  
  try {
    // Limpiar toda la colección antes de insertar nuevos registros
    const deleteResult = await DisponibilidadAcompaniamiento.deleteMany({});
    console.log(`Se eliminaron ${deleteResult.deletedCount} registros existentes de la colección.`);
    
    // Insertar los nuevos registros
    const result = await DisponibilidadAcompaniamiento.insertMany(recordsToInsert, { ordered: false });
    
    res.status(201).json({
      message: `Colección limpiada exitosamente. ${result.length} nuevos registros de disponibilidad insertados.`,
      deletedCount: deleteResult.deletedCount,
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
            failedDocumentPreview: e.err.op ? { dni: e.err.op.dni } : "No disponible"
          }))
        : { generalMessage: err.message, code: err.code };
      return res.status(400).json({
        message: "Error durante la carga masiva de disponibilidad después de limpiar la colección. Algunos registros podrían no haberse insertado.",
        details: errorDetails
      });
    }
    
    res.status(500).json({ message: "Error interno del servidor durante la carga masiva: " + err.message });
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
    const { 
      apellidosNombresCompletos, 
      horasDisponiblesParaRealizarAcompaniamientoPresencial,
      disponibilidades 
    } = req.body;
    
    // Validar DNI
    if (!dni || dni.trim() === '') {
      return res.status(400).json({ message: 'El DNI es requerido y no puede estar vacío' });
    }
    
    // Validar que disponibilidades sea un array (dentro del objeto del body)
    if (!Array.isArray(disponibilidades)) {
      return res.status(400).json({ message: 'El campo "disponibilidades" debe ser un array' });
    }
    
    const dniTrimmed = dni.trim();
    
    // Usar findOneAndUpdate con 'upsert: true' para simplificar la lógica de crear o actualizar
    const updatePayload = {
      $set: {
        dni: dniTrimmed,
        apellidosNombresCompletos,
        horasDisponiblesParaRealizarAcompaniamientoPresencial: horasDisponiblesParaRealizarAcompaniamientoPresencial || 0,
        disponibilidades
      }
    };
    
    const options = {
      upsert: true, // Crea el documento si no existe
      new: true, // Devuelve el documento modificado
      runValidators: true // Ejecuta las validaciones del Schema
    };

    const calendarioActualizado = await DisponibilidadAcompaniamiento.findOneAndUpdate({ dni: dniTrimmed }, updatePayload, options);
    
    // --- CORRECCIÓN CLAVE AQUÍ ---
    // Se devuelve la clave 'calendarioActualizado' que el frontend espera.
    res.json({
      message: 'Calendario actualizado exitosamente',
      calendarioActualizado: calendarioActualizado 
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
    
    const especialista = await DisponibilidadAcompaniamiento.findOne({ dni: dni.trim() })
      .lean();
    
    if (!especialista) {
      return res.status(404).json({ 
        message: `No se encontró calendario para el especialista con DNI: ${dni}` 
      });
    }
    
    // Agrupar disponibilidades por día para facilitar la visualización en el frontend
    const calendarioAgrupado = (especialista.disponibilidades || []).reduce((acc, disp) => {
      if (!acc[disp.dia]) {
        acc[disp.dia] = [];
      }
      acc[disp.dia].push(disp);
      return acc;
    }, {});
    
    res.json({
      especialista: {
        dni: especialista.dni,
        apellidosNombresCompletos: especialista.apellidosNombresCompletos,
        horasDisponiblesParaRealizarAcompaniamientoPresencial: especialista.horasDisponiblesParaRealizarAcompaniamientoPresencial,
      },
      calendario: calendarioAgrupado,
      disponibilidadesTotales: (especialista.disponibilidades || []).length,
      disponibilidadesDetalle: especialista.disponibilidades || []
    });
  } catch (err) {
    console.error("Error al obtener calendario:", err);
    res.status(500).json({ 
      message: "Error interno del servidor al obtener el calendario: " + err.message 
    });
  }
});

// POST: Agregar disponibilidades a un especialista existente
router.post('/especialista/:dni/disponibilidades', async (req, res) => {
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
    
    const dniTrimmed = dni.trim();
    
    // Buscar el especialista
    const especialista = await DisponibilidadAcompaniamiento.findOne({ dni: dniTrimmed });
    
    if (!especialista) {
      return res.status(404).json({ 
        message: `No se encontró especialista con DNI: ${dni}` 
      });
    }
    
    // Agregar las nuevas disponibilidades
    especialista.disponibilidades.push(...nuevasDisponibilidades);
    
    await especialista.save();
    
    res.json({
      message: 'Disponibilidades agregadas exitosamente',
      disponibilidadesAgregadas: nuevasDisponibilidades.length,
      data: especialista
    });
  } catch (err) {
    console.error("Error al agregar disponibilidades:", err);
    
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ 
        message: "Error de validación al agregar disponibilidades", 
        errors 
      });
    }
    
    res.status(500).json({ 
      message: "Error interno del servidor al agregar disponibilidades: " + err.message 
    });
  }
});

// DELETE: Eliminar disponibilidades específicas de un especialista
router.delete('/especialista/:dni/disponibilidades', async (req, res) => {
  try {
    const { dni } = req.params;
    const { indices } = req.body; // Array de índices a eliminar
    
    // Validar DNI
    if (!dni || dni.trim() === '') {
      return res.status(400).json({ message: 'El DNI es requerido y no puede estar vacío' });
    }
    
    // Validar indices
    if (!Array.isArray(indices) || indices.length === 0) {
      return res.status(400).json({ message: 'Se requiere un array de índices para eliminar' });
    }
    
    const dniTrimmed = dni.trim();
    
    // Buscar el especialista
    const especialista = await DisponibilidadAcompaniamiento.findOne({ dni: dniTrimmed });
    
    if (!especialista) {
      return res.status(404).json({ 
        message: `No se encontró especialista con DNI: ${dni}` 
      });
    }
    
    // Ordenar indices de mayor a menor para evitar problemas al eliminar
    const indicesOrdenados = indices.sort((a, b) => b - a);
    
    let eliminados = 0;
    indicesOrdenados.forEach(index => {
      if (index >= 0 && index < especialista.disponibilidades.length) {
        especialista.disponibilidades.splice(index, 1);
        eliminados++;
      }
    });
    
    await especialista.save();
    
    res.json({
      message: 'Disponibilidades eliminadas exitosamente',
      disponibilidadesEliminadas: eliminados,
      data: especialista
    });
  } catch (err) {
    console.error("Error al eliminar disponibilidades:", err);
    res.status(500).json({ 
      message: "Error interno del servidor al eliminar disponibilidades: " + err.message 
    });
  }
});

module.exports = router;