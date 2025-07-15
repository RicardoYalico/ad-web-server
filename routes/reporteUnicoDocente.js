const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ReporteUnicoDocente = require('../models/ReporteUnicoDocente');

// ✅ GET: Reporte corregido con campos consistentes
router.get('/reporte', async (req, res) => {
  try {
    const reporte = await ReporteUnicoDocente.aggregate([
      {
        $group: {
          _id: {
            semestre: "$semestre",
            fechaCarga: "$fechaCarga"
          },
          cantidad: { $sum: 1 },
          ultimaActualizacion: { $max: "$updatedAt" }
        }
      },
      {
        $project: {
          _id: 0,
          semestre: "$_id.semestre",
          fechaCarga: "$_id.fechaCarga",
          cantidad: "$cantidad",
          ultimaActualizacion: "$ultimaActualizacion"
        }
      },
      {
        $sort: {
          semestre: 1,
          fechaCarga: -1
        }
      }
    ]);
    
    res.json({
      data: reporte,
      total: reporte.length
    });
  } catch (err) {
    console.error('Error en la agregación:', err);
    res.status(500).json({ 
      message: 'Error al generar el reporte', 
      error: err.message 
    });
  }
});

// ✅ GET: Obtener reportes con filtros mejorados
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 100,
      dni,
      codigoColaborador,
      codigoBanner,
      sedeDictado,
      facultad,
      carrera,
      semestre
    } = req.query;
    
    const query = {};
    
    if (dni) query.dni = dni;
    if (codigoColaborador) query.codigoColaborador = codigoColaborador;
    if (codigoBanner) query.codigoBanner = codigoBanner;
    if (sedeDictado) query.sedeDictado = new RegExp(sedeDictado, 'i');
    if (facultad) query.facultad = new RegExp(facultad, 'i');
    if (carrera) query.carrera = new RegExp(carrera, 'i');
    if (semestre) query.semestre = semestre;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [reportes, total] = await Promise.all([
      ReporteUnicoDocente.find(query)
        .sort({ dni: 1, codigoColaborador: 1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      ReporteUnicoDocente.countDocuments(query)
    ]);
    
    res.json({
      data: reportes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalDocs: total,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      },
      fechaUltimaCarga: reportes[0]?.fechaCarga || null
    });
    
  } catch (err) {
    console.error("Error al obtener los reportes:", err);
    res.status(500).json({ 
      message: "Error al obtener los reportes", 
      error: err.message 
    });
  }
});

// ✅ GET: Exportar datos para Excel (sin paginación)
router.get('/export', async (req, res) => {
  try {
    const { 
      dni,
      codigoColaborador,
      codigoBanner,
      sedeDictado,
      facultad,
      carrera,
      semestre,
      formato = 'completo' // 'completo' o 'basico'
    } = req.query;
    
    // Construir query de filtros (igual que el endpoint principal)
    const query = {};
    if (dni) query.dni = dni;
    if (codigoColaborador) query.codigoColaborador = codigoColaborador;
    if (codigoBanner) query.codigoBanner = codigoBanner;
    if (sedeDictado) query.sedeDictado = new RegExp(sedeDictado, 'i');
    if (facultad) query.facultad = new RegExp(facultad, 'i');
    if (carrera) query.carrera = new RegExp(carrera, 'i');
    if (semestre) query.semestre = semestre;
    
    console.log(`📊 Exportando reportes únicos para Excel. Filtros aplicados:`, query);
    
    // Obtener TODOS los registros sin límite ni paginación
    const reportes = await ReporteUnicoDocente.find(query)
      .sort({ dni: 1, codigoColaborador: 1 })
      .lean(); // lean() para mejor performance
    
    // Formatear datos según el tipo solicitado
    let datosExport;
    
    if (formato === 'basico') {
      // Formato básico - solo campos esenciales para reportes únicos
      datosExport = reportes.map(reporte => ({
        'Código Colaborador': reporte.codigoColaborador,
        'DNI': reporte.dni,
        'Código Banner': reporte.codigoBanner,
        'Docente': reporte.docente,
        'Rol 2025-1': reporte.rol2025_1,
        'Horas Pedagógicas M1': reporte.horasPedagogicasM1,
        'Horas Pedagógicas M2': reporte.horasPedagogicasM2,
        'Alerta': reporte.alerta,
        'Sede Dictado': reporte.sedeDictado,
        'Facultad': reporte.facultad,
        'Carrera': reporte.carrera,
        'Semestre': reporte.semestre,
        'Fecha Carga': reporte.fechaCarga
      }));
    } else {
      // Formato completo - TODOS los campos del modelo
      datosExport = reportes.map(reporte => ({
        // Información básica del registro
        'ID Registro': reporte._id,
        'Semestre': reporte.semestre,
        'Fecha Carga': reporte.fechaCarga,
        
        // Identificadores del docente
        'Código Colaborador': reporte.codigoColaborador,
        'DNI': reporte.dni,
        'Código Banner': reporte.codigoBanner,
        'Docente': reporte.docente,
        
        // Información específica del reporte
        'Rol 2025-1': reporte.rol2025_1,
        'Horas Pedagógicas M1': reporte.horasPedagogicasM1,
        'Horas Pedagógicas M2': reporte.horasPedagogicasM2,
        'Total Horas Pedagógicas': (reporte.horasPedagogicasM1 || 0) + (reporte.horasPedagogicasM2 || 0),
        'Alerta': reporte.alerta,
        
        // Información de contacto y ubicación
        'Correo Docente': reporte.correoDocente,
        'Sede Dictado': reporte.sedeDictado,
        'Facultad': reporte.facultad,
        'Carrera': reporte.carrera,
        'Responsable Programación': reporte.responsableProgramacion,
        
        // Metadatos del sistema
        'Fecha Creación': reporte.createdAt ? new Date(reporte.createdAt).toLocaleDateString('es-PE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : '',
        'Última Actualización': reporte.updatedAt ? new Date(reporte.updatedAt).toLocaleDateString('es-PE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : ''
      }));
    }
    
    // Estadísticas del export
    const stats = {
      totalReportes: reportes.length,
      docentesUnicos: [...new Set(reportes.map(r => r.dni).filter(dni => dni))].length,
      sedesUnicas: [...new Set(reportes.map(r => r.sedeDictado).filter(sede => sede))].length,
      facultadesUnicas: [...new Set(reportes.map(r => r.facultad).filter(facultad => facultad))].length,
      carrerasUnicas: [...new Set(reportes.map(r => r.carrera).filter(carrera => carrera))].length,
      semestres: [...new Set(reportes.map(r => r.semestre).filter(semestre => semestre))],
      fechaUltimaCarga: reportes[0]?.fechaCarga || null,
      totalHorasM1: reportes.reduce((sum, r) => sum + (r.horasPedagogicasM1 || 0), 0),
      totalHorasM2: reportes.reduce((sum, r) => sum + (r.horasPedagogicasM2 || 0), 0),
      promedioHorasM1: reportes.filter(r => r.horasPedagogicasM1 !== null).length > 0 ? 
        (reportes.reduce((sum, r) => sum + (r.horasPedagogicasM1 || 0), 0) / reportes.filter(r => r.horasPedagogicasM1 !== null).length).toFixed(2) : null,
      promedioHorasM2: reportes.filter(r => r.horasPedagogicasM2 !== null).length > 0 ? 
        (reportes.reduce((sum, r) => sum + (r.horasPedagogicasM2 || 0), 0) / reportes.filter(r => r.horasPedagogicasM2 !== null).length).toFixed(2) : null,
      reportesConAlerta: reportes.filter(r => r.alerta && r.alerta.trim() !== '').length
    };
    
    console.log(`✅ Export de reportes únicos preparado: ${datosExport.length} registros`);
    
    res.json({
      success: true,
      mensaje: `Reportes únicos preparados para exportación a Excel`,
      datos: datosExport,
      estadisticas: stats,
      metadatos: {
        fechaExport: new Date().toISOString(),
        formatoSolicitado: formato,
        filtrosAplicados: query,
        camposIncluidos: formato === 'basico' ? 13 : Object.keys(datosExport[0] || {}).length
      }
    });
    
  } catch (err) {
    console.error('💥 Error en exportación de reportes únicos:', err);
    res.status(500).json({ 
      success: false,
      message: 'Error al preparar reportes únicos para exportación', 
      error: err.message 
    });
  }
});

// ✅ GET: Reportes de un docente específico por DNI
router.get('/docente/:dni', async (req, res) => {
  try {
    const { dni } = req.params;
    
    const reportes = await ReporteUnicoDocente.find({ dni })
      .sort({ fechaCarga: -1 })
      .lean();
      
    if (reportes.length === 0) {
      return res.status(404).json({ 
        message: `No se encontraron reportes para el docente con DNI ${dni}` 
      });
    }
    
    res.json({
      dni: dni,
      nombre: reportes[0].nombre || 'N/A',
      semestre: reportes[0].semestre,
      totalReportes: reportes.length,
      reportes: reportes,
      fechaUltimaCarga: reportes[0].fechaCarga
    });
    
  } catch (err) {
    console.error('Error al obtener reportes del docente:', err);
    res.status(500).json({ 
      message: 'Error al obtener reportes del docente', 
      error: err.message 
    });
  }
});

// ✅ POST: Carga masiva UNIFICADA - LIMPIA y REEMPLAZA totalmente
router.post('/bulk', async (req, res) => {
  let registrosNuevos;
  let fechaCarga;
  
  // ✅ DETECCIÓN AUTOMÁTICA DEL FORMATO
  if (req.body.fechaCarga && req.body.datos) {
    // Formato: { fechaCarga: "2025-07-13", datos: [...] }
    fechaCarga = req.body.fechaCarga;
    registrosNuevos = req.body.datos;
    console.log('📦 Formato detectado: Estructura con fechaCarga separada');
  } else if (Array.isArray(req.body) && req.body.length > 0) {
    // Formato: [{ fechaCarga: "2025-07-13", semestre: "2025-1", ... }, ...]
    registrosNuevos = req.body;
    fechaCarga = registrosNuevos[0]?.fechaCarga || new Date().toISOString().split('T')[0];
    console.log('📦 Formato detectado: Array directo con fechaCarga en cada registro');
  } else {
    return res.status(400).json({ 
      message: "Formato inválido. Usa: { fechaCarga: 'YYYY-MM-DD', datos: [...] } o [{ fechaCarga: 'YYYY-MM-DD', ... }]" 
    });
  }
  
  // Validaciones
  if (!fechaCarga) {
    return res.status(400).json({ 
      message: "El campo 'fechaCarga' es requerido (formato: YYYY-MM-DD). Ejemplo: 2025-07-13" 
    });
  }
  
  const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!fechaRegex.test(fechaCarga)) {
    return res.status(400).json({ 
      message: "fechaCarga debe tener formato YYYY-MM-DD. Ejemplo: 2025-07-13" 
    });
  }
  
  if (!Array.isArray(registrosNuevos) || registrosNuevos.length === 0) {
    return res.status(400).json({ 
      message: "Los registros deben ser un array no vacío." 
    });
  }
  
  const semestre = registrosNuevos[0]?.semestre;
  if (!semestre) {
    return res.status(400).json({ 
      message: "Todos los registros deben tener el campo 'semestre'." 
    });
  }
  
  console.log(`📅 Reemplazando COMPLETAMENTE reportes del semestre ${semestre} con fecha ${fechaCarga}: ${registrosNuevos.length} registros`);
  
  try {
    // 1. 🗑️ ELIMINAR TODOS los reportes anteriores del mismo semestre (LIMPIEZA COMPLETA)
    console.log(`🗑️ Eliminando TODOS los reportes anteriores del semestre ${semestre}...`);
    const deleteResult = await ReporteUnicoDocente.deleteMany({ semestre });
    console.log(`✅ Eliminados: ${deleteResult.deletedCount} registros antiguos`);
    
    // 2. ➕ INSERTAR TODOS los nuevos reportes (REEMPLAZO COMPLETO)
    console.log(`➕ Insertando TODOS los nuevos reportes con fecha: ${fechaCarga}...`);
    const registrosConFecha = registrosNuevos.map(reg => ({
      ...reg,
      fechaCarga: fechaCarga // ✅ Asegurar que todos tengan la misma fechaCarga
    }));
    
    // Insertar en lotes para mejor performance
    const BATCH_SIZE = 1000;
    let totalInsertados = 0;
    let totalFallidos = 0;
    const errores = [];
    
    for (let i = 0; i < registrosConFecha.length; i += BATCH_SIZE) {
      const lote = registrosConFecha.slice(i, i + BATCH_SIZE);
      const numeroLote = Math.floor(i / BATCH_SIZE) + 1;
      console.log(`📦 Insertando lote ${numeroLote}: ${lote.length} registros`);
      
      try {
        const insertResult = await ReporteUnicoDocente.insertMany(lote, { 
          ordered: false // Continúa aunque algunos fallen
        });
        totalInsertados += insertResult.length;
        console.log(`✅ Lote ${numeroLote} insertado: ${insertResult.length} registros`);
      } catch (err) {
        // Manejar errores de inserción parcial
        const insertados = err.result?.nInserted || 0;
        totalInsertados += insertados;
        totalFallidos += (lote.length - insertados);
        
        if (err.writeErrors) {
          errores.push(...err.writeErrors.slice(0, 3).map(e => ({
            lote: numeroLote,
            index: i + e.index,
            error: e.errmsg
          })));
        }
        
        console.log(`⚠️ Lote ${numeroLote} con errores: ${insertados} insertados, ${lote.length - insertados} fallidos`);
      }
    }
    
    console.log(`🎉 REEMPLAZO COMPLETO: ${totalInsertados} exitosos, ${totalFallidos} fallidos`);
    
    // ✅ RESPUESTA DE ÉXITO
    const response = {
      message: `Reportes del semestre ${semestre} REEMPLAZADOS COMPLETAMENTE con fecha ${fechaCarga}`,
      fechaCarga: fechaCarga,
      fechaProcesamiento: new Date().toISOString().split('T')[0],
      semestre: semestre,
      operacion: 'REEMPLAZO_COMPLETO',
      registrosProcesados: registrosNuevos.length,
      registrosInsertados: totalInsertados,
      registrosFallidos: totalFallidos,
      registrosEliminados: deleteResult.deletedCount,
      estado: totalFallidos === 0 ? 'EXITOSA' : 'PARCIAL'
    };
    
    if (errores.length > 0) {
      response.erroresMuestra = errores.slice(0, 5); // Máximo 5 errores
    }
    
    if (totalFallidos > 0) {
      res.status(207).json(response); // 207 Multi-Status
    } else {
      res.status(201).json(response); // 201 Created
    }
    
  } catch (err) {
    console.error(`💥 Error en reemplazo completo de reportes ${fechaCarga}:`, err);
    
    res.status(500).json({
      message: 'Error crítico durante el reemplazo completo',
      fechaCarga: fechaCarga,
      semestre: semestre,
      operacion: 'REEMPLAZO_COMPLETO',
      error: err.message,
      estado: 'FALLIDA'
    });
  }
});

// ✅ GET: Información del sistema
router.get('/info', async (req, res) => {
  try {
    const admin = mongoose.connection.db.admin();
    let soportaTransacciones = false;
    
    try {
      const replSetStatus = await admin.command({ replSetGetStatus: 1 });
      soportaTransacciones = !!replSetStatus;
    } catch (e) {
      soportaTransacciones = false;
    }
    
    const stats = await ReporteUnicoDocente.collection.stats();
    
    res.json({
      baseDatos: {
        nombre: mongoose.connection.name,
        coleccion: ReporteUnicoDocente.collection.collectionName,
        soportaTransacciones: soportaTransacciones
      },
      estadisticas: {
        documentos: stats.count,
        tamaño: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
        indices: stats.nindexes
      }
    });
    
  } catch (err) {
    res.status(500).json({ 
      message: 'Error al obtener información', 
      error: err.message 
    });
  }
});

// ✅ DELETE: Eliminar por semestre y fecha
router.delete('/bulk', async (req, res) => {
  const { semestre, fechaCarga } = req.body;
  
  if (!semestre || !fechaCarga) {
    return res.status(400).json({
      message: 'Los campos "semestre" y "fechaCarga" son requeridos.'
    });
  }
  
  try {
    const filter = { semestre, fechaCarga };
    const result = await ReporteUnicoDocente.deleteMany(filter);
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: `No se encontraron reportes para eliminar con semestre: ${semestre} y fecha: ${fechaCarga}`,
        deletedCount: 0
      });
    }
    
    res.status(200).json({
      message: `Se eliminaron ${result.deletedCount} reportes del semestre ${semestre}`,
      deletedCount: result.deletedCount,
      semestre: semestre,
      fechaCarga: fechaCarga
    });
    
  } catch (err) {
    console.error('Error al eliminar reportes:', err);
    res.status(500).json({ 
      message: "Error interno del servidor",
      error: err.message 
    });
  }
});

// ✅ GET: Verificar estado de los reportes
router.get('/estado', async (req, res) => {
  try {
    const { semestre } = req.query;
    
    let query = {};
    if (semestre) query.semestre = semestre;
    
    const ultimoReporte = await ReporteUnicoDocente.findOne(query, { 
      fechaCarga: 1, 
      semestre: 1 
    })
    .sort({ fechaCarga: -1 })
    .lean();
      
    const totalReportes = await ReporteUnicoDocente.countDocuments(query);
    
    const hoy = new Date().toISOString().split('T')[0];
    const esActual = ultimoReporte?.fechaCarga === hoy;
    
    res.json({
      estado: esActual ? 'ACTUALIZADA' : 'DESACTUALIZADA',
      fechaUltimaCarga: ultimoReporte?.fechaCarga || null,
      fechaHoy: hoy,
      semestre: ultimoReporte?.semestre || semestre || 'N/A',
      totalReportes: totalReportes,
      mensaje: esActual ? 
        'Los reportes están actualizados' : 
        `Los reportes necesitan actualizarse. Última carga: ${ultimoReporte?.fechaCarga || 'Nunca'}`
    });
    
  } catch (err) {
    console.error('Error al verificar estado:', err);
    res.status(500).json({ 
      message: 'Error al verificar estado', 
      error: err.message 
    });
  }
});

// ✅ POST: Crear un nuevo reporte individual
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
      return res.status(400).json({ 
        message: "Error de validación al crear el reporte.", 
        errors 
      });
    }
    if (err.code === 11000) { 
      return res.status(409).json({
        message: "Error: Ya existe un registro con algunos de los datos únicos proporcionados.",
        details: err.keyValue
      });
    }
    console.error("Error al crear el reporte:", err);
    res.status(400).json({ 
      message: "Error al crear el reporte: " + err.message 
    });
  }
});

// ✅ Middleware para operaciones individuales
async function getReporteDocente(req, res, next) {
  let reporte;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de reporte no válido' });
    }
    
    reporte = await ReporteUnicoDocente.findById(req.params.id);
    
    if (reporte == null) {
      return res.status(404).json({ 
        message: 'No se pudo encontrar el reporte con el ID proporcionado.' 
      });
    }
  } catch (err) {
    console.error("Error en middleware getReporteDocente:", err);
    return res.status(500).json({ 
      message: "Error interno del servidor: " + err.message 
    });
  }
  
  res.reporteDocente = reporte;
  next();
}

// ✅ GET: Un reporte por ID
router.get('/:id', getReporteDocente, (req, res) => {
  res.json(res.reporteDocente);
});

// ✅ PUT: Actualizar reporte individual
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
      return res.status(400).json({ 
        message: "Error de validación al actualizar el reporte.", 
        errors 
      });
    }
    if (err.code === 11000) {
      return res.status(409).json({ 
        message: "Error: Intento de actualizar a un valor que viola una restricción única.",
        details: err.keyValue
      });
    }
    console.error("Error al actualizar el reporte:", err);
    res.status(400).json({ 
      message: "Error al actualizar el reporte: " + err.message 
    });
  }
});

// ✅ DELETE: Eliminar reporte individual
router.delete('/:id', getReporteDocente, async (req, res) => {
  try {
    await res.reporteDocente.deleteOne();
    res.json({ message: 'Reporte eliminado exitosamente' });
  } catch (err) {
    console.error("Error al eliminar el reporte:", err);
    res.status(500).json({ 
      message: "Error al eliminar el reporte: " + err.message 
    });
  }
});

module.exports = router;