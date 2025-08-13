const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const PlanIntegralDocente = require('../models/PlanIntegralDocente');

// ✅ GET: Reporte corregido con campos consistentes
router.get('/reporte', async (req, res) => {
  try {
    const reporte = await PlanIntegralDocente.aggregate([
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

// ✅ GET: Obtener planes con filtros mejorados
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 100,
      dni,
      campus,
      banner,
      facultad,
      carrera,
      semestre
    } = req.query;
    
    const query = {};
    
    if (dni) query.dni = new RegExp(dni, 'i');
    if (campus) query.campus = new RegExp(campus, 'i');
    if (banner) query.banner = new RegExp(banner, 'i');
    if (facultad) query.facultad = new RegExp(facultad, 'i');
    if (carrera) query.carrera = new RegExp(carrera, 'i');
    if (semestre) query.semestre = semestre;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [planes, total] = await Promise.all([
      PlanIntegralDocente.find(query)
        .sort({ dni: 1, campus: 1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      PlanIntegralDocente.countDocuments(query)
    ]);
    
    res.json({
      data: planes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalDocs: total,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      },
      fechaUltimaCarga: planes[0]?.fechaCarga || null
    });
    
  } catch (err) {
    console.error("Error al obtener los planes:", err);
    res.status(500).json({ 
      message: "Error al obtener los planes", 
      error: err.message 
    });
  }
});

// ✅ GET: Exportar datos para Excel (sin paginación)
router.get('/export', async (req, res) => {
  try {
    const { 
      dni,
      campus,
      banner,
      facultad,
      carrera,
      semestre,
      formato = 'completo' // 'completo' o 'basico'
    } = req.query;
    
    // Construir query de filtros (igual que el endpoint principal)
    const query = {};
    if (dni) query.dni = new RegExp(dni, 'i');
    if (campus) query.campus = new RegExp(campus, 'i');
    if (banner) query.banner = new RegExp(banner, 'i');
    if (facultad) query.facultad = new RegExp(facultad, 'i');
    if (carrera) query.carrera = new RegExp(carrera, 'i');
    if (semestre) query.semestre = semestre;
    
    console.log(`📊 Exportando planes para Excel. Filtros aplicados:`, query);
    
    // Obtener TODOS los registros sin límite ni paginación
    const planes = await PlanIntegralDocente.find(query)
      .sort({ dni: 1, campus: 1 })
      .lean(); // lean() para mejor performance
    
    // Formatear datos según el tipo solicitado
    let datosExport;
    
    if (formato === 'basico') {
      // Formato básico - solo campos esenciales para planes docentes
      datosExport = planes.map(plan => ({
        'DNI': plan.dni,
        'Docente': plan.docente,
        'Campus': plan.campus,
        'Facultad': plan.facultad,
        'Carrera': plan.carrera,
        'Banner': plan.banner,
        'Cargo': plan.cargo,
        'Correo': plan.correo,
        'ESA': plan.esa,
        'Rúbrica': plan.rubrica,
        'Semestre': plan.semestre,
        'Fecha Carga': plan.fechaCarga
      }));
    } else {
      // Formato completo - TODOS los campos del modelo
      datosExport = planes.map(plan => ({
        // Información básica del registro
        'ID Registro': plan._id,
        'Semestre': plan.semestre,
        'Fecha Carga': plan.fechaCarga,
        
        // Información del docente y contexto académico
        'Campus': plan.campus,
        'Facultad': plan.facultad,
        'Carrera': plan.carrera,
        'Modalidad': plan.modalidad,
        'Payroll': plan.payroll,
        'DNI': plan.dni,
        'Banner': plan.banner,
        'Docente': plan.docente,
        'Cargo': plan.cargo,
        'Correo': plan.correo,
        
        // Indicadores generales
        'ESA': plan.esa,
        'Rúbrica': plan.rubrica,
        'Dispersión': plan.dispersion,
        
        // Detalles del plan y primer curso
        'Tipo Plan Integral': plan.tipoPlanIntegral,
        'Modalidad Curso': plan.modalidadCurso,
        'Programa Curso': plan.programaCurso,
        'Código Curso': plan.codCurso,
        'Nombre Curso': plan.nombreCurso,
        'ESA Curso': plan.esaCurso,
        'Rúbrica Curso': plan.rubricaCurso,
        'Dispersión Curso': plan.dispersionCurso,
        'Encuentra Programación': plan.encuentraProgramacion,
        
        // Segundo curso (opcional)
        'Modalidad Curso 2': plan.modalidadCurso2,
        'Programa Curso 2': plan.programaCurso2,
        'Código Curso 2': plan.codCurso2,
        'Nombre Curso 2': plan.nombreCurso2,
        'ESA Curso 2': plan.esaCurso2,
        'Rúbrica Curso 2': plan.rubricaCurso2,
        'Dispersión Curso 2': plan.dispersionCurso2,
        'Encuentra Programación 2': plan.encuentraProgramacion2,
        
        // Seguimiento y gestión
        'Plan Mejora': plan.planMejora,
        'Coordinadora': plan.coordinadora,
        'Comentarios': plan.comentarios,
        'Respuesta Docente': plan.respuestaDocente,
        'Columna': plan.columna,
        'Estado Final': plan.estadoFinal,
        'Asignación': plan.asignacion,
        
        // Metadatos del sistema
        'Fecha Creación': plan.createdAt ? new Date(plan.createdAt).toLocaleDateString('es-PE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : '',
        'Última Actualización': plan.updatedAt ? new Date(plan.updatedAt).toLocaleDateString('es-PE', {
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
      totalPlanes: planes.length,
      docentesUnicos: [...new Set(planes.map(p => p.dni).filter(dni => dni))].length,
      campusUnicos: [...new Set(planes.map(p => p.campus).filter(campus => campus))].length,
      facultadesUnicas: [...new Set(planes.map(p => p.facultad).filter(facultad => facultad))].length,
      carrerasUnicas: [...new Set(planes.map(p => p.carrera).filter(carrera => carrera))].length,
      semestres: [...new Set(planes.map(p => p.semestre).filter(semestre => semestre))],
      fechaUltimaCarga: planes[0]?.fechaCarga || null,
      promedioESA: planes.filter(p => p.esa !== null).length > 0 ? 
        (planes.reduce((sum, p) => sum + (p.esa || 0), 0) / planes.filter(p => p.esa !== null).length).toFixed(2) : null,
      promedioRubrica: planes.filter(p => p.rubrica !== null).length > 0 ? 
        (planes.reduce((sum, p) => sum + (p.rubrica || 0), 0) / planes.filter(p => p.rubrica !== null).length).toFixed(2) : null
    };
    
    console.log(`✅ Export de planes preparado: ${datosExport.length} registros`);
    
    res.json({
      success: true,
      mensaje: `Planes preparados para exportación a Excel`,
      datos: datosExport,
      estadisticas: stats,
      metadatos: {
        fechaExport: new Date().toISOString(),
        formatoSolicitado: formato,
        filtrosAplicados: query,
        camposIncluidos: formato === 'basico' ? 12 : Object.keys(datosExport[0] || {}).length
      }
    });
    
  } catch (err) {
    console.error('💥 Error en exportación de planes:', err);
    res.status(500).json({ 
      success: false,
      message: 'Error al preparar planes para exportación', 
      error: err.message 
    });
  }
});

// ✅ GET: Planes de un docente específico por DNI
router.get('/docente/:dni', async (req, res) => {
  try {
    const { dni } = req.params;
    
    const planes = await PlanIntegralDocente.find({ dni })
      .sort({ fechaCarga: -1 })
      .lean();
      
    if (planes.length === 0) {
      return res.status(404).json({ 
        message: `No se encontraron planes para el docente con DNI ${dni}` 
      });
    }
    
    res.json({
      dni: dni,
      nombre: planes[0].nombre || 'N/A',
      semestre: planes[0].semestre,
      totalPlanes: planes.length,
      planes: planes,
      fechaUltimaCarga: planes[0].fechaCarga
    });
    
  } catch (err) {
    console.error('Error al obtener planes del docente:', err);
    res.status(500).json({ 
      message: 'Error al obtener planes del docente', 
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
  
  console.log(`📅 Reemplazando COMPLETAMENTE planes del semestre ${semestre} con fecha ${fechaCarga}: ${registrosNuevos.length} registros`);
  
  try {
    // 1. 🗑️ ELIMINAR TODOS los planes anteriores del mismo semestre (LIMPIEZA COMPLETA)
    console.log(`🗑️ Eliminando TODOS los planes anteriores del semestre ${semestre}...`);
    const deleteResult = await PlanIntegralDocente.deleteMany({ semestre });
    console.log(`✅ Eliminados: ${deleteResult.deletedCount} registros antiguos`);
    
    // 2. ➕ INSERTAR TODOS los nuevos planes (REEMPLAZO COMPLETO)
    console.log(`➕ Insertando TODOS los nuevos planes con fecha: ${fechaCarga}...`);
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
        const insertResult = await PlanIntegralDocente.insertMany(lote, { 
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
      message: `Planes del semestre ${semestre} REEMPLAZADOS COMPLETAMENTE con fecha ${fechaCarga}`,
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
    console.error(`💥 Error en reemplazo completo de planes ${fechaCarga}:`, err);
    
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
    
    const stats = await PlanIntegralDocente.collection.stats();
    
    res.json({
      baseDatos: {
        nombre: mongoose.connection.name,
        coleccion: PlanIntegralDocente.collection.collectionName,
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
    const result = await PlanIntegralDocente.deleteMany(filter);
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: `No se encontraron planes para eliminar con semestre: ${semestre} y fecha: ${fechaCarga}`,
        deletedCount: 0
      });
    }
    
    res.status(200).json({
      message: `Se eliminaron ${result.deletedCount} planes del semestre ${semestre}`,
      deletedCount: result.deletedCount,
      semestre: semestre,
      fechaCarga: fechaCarga
    });
    
  } catch (err) {
    console.error('Error al eliminar planes:', err);
    res.status(500).json({ 
      message: "Error interno del servidor",
      error: err.message 
    });
  }
});

// ✅ GET: Verificar estado de los planes
router.get('/estado', async (req, res) => {
  try {
    const { semestre } = req.query;
    
    let query = {};
    if (semestre) query.semestre = semestre;
    
    const ultimoPlan = await PlanIntegralDocente.findOne(query, { 
      fechaCarga: 1, 
      semestre: 1 
    })
    .sort({ fechaCarga: -1 })
    .lean();
      
    const totalPlanes = await PlanIntegralDocente.countDocuments(query);
    
    const hoy = new Date().toISOString().split('T')[0];
    const esActual = ultimoPlan?.fechaCarga === hoy;
    
    res.json({
      estado: esActual ? 'ACTUALIZADA' : 'DESACTUALIZADA',
      fechaUltimaCarga: ultimoPlan?.fechaCarga || null,
      fechaHoy: hoy,
      semestre: ultimoPlan?.semestre || semestre || 'N/A',
      totalPlanes: totalPlanes,
      mensaje: esActual ? 
        'Los planes están actualizados' : 
        `Los planes necesitan actualizarse. Última carga: ${ultimoPlan?.fechaCarga || 'Nunca'}`
    });
    
  } catch (err) {
    console.error('Error al verificar estado:', err);
    res.status(500).json({ 
      message: 'Error al verificar estado', 
      error: err.message 
    });
  }
});

// ✅ POST: Crear un nuevo plan individual
router.post('/', async (req, res) => {
  const plan = new PlanIntegralDocente(req.body);
  try {
    const nuevoPlan = await plan.save();
    res.status(201).json(nuevoPlan);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ 
        message: "Error de validación al crear el plan.", 
        errors 
      });
    }
    if (err.code === 11000) { 
      return res.status(409).json({
        message: "Error: Ya existe un registro con algunos de los datos únicos proporcionados.",
        details: err.keyValue
      });
    }
    console.error("Error al crear el plan:", err);
    res.status(400).json({ 
      message: "Error al crear el plan: " + err.message 
    });
  }
});

// ✅ Middleware para operaciones individuales
async function getPlanIntegralDocente(req, res, next) {
  let plan;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de plan no válido' });
    }
    
    plan = await PlanIntegralDocente.findById(req.params.id);
    
    if (plan == null) {
      return res.status(404).json({ 
        message: 'No se pudo encontrar el plan con el ID proporcionado.' 
      });
    }
  } catch (err) {
    console.error("Error en middleware getPlanIntegralDocente:", err);
    return res.status(500).json({ 
      message: "Error interno del servidor: " + err.message 
    });
  }
  
  res.planIntegralDocente = plan;
  next();
}

// ✅ GET: Un plan por ID
router.get('/:id', getPlanIntegralDocente, (req, res) => {
  res.json(res.planIntegralDocente);
});

// ✅ PUT: Actualizar plan individual
router.put('/:id', getPlanIntegralDocente, async (req, res) => {
  Object.assign(res.planIntegralDocente, req.body);
  try {
    const planActualizado = await res.planIntegralDocente.save({ runValidators: true });
    res.json(planActualizado);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({ 
        message: "Error de validación al actualizar el plan.", 
        errors 
      });
    }
    if (err.code === 11000) {
      return res.status(409).json({ 
        message: "Error: Intento de actualizar a un valor que viola una restricción única.",
        details: err.keyValue
      });
    }
    console.error("Error al actualizar el plan:", err);
    res.status(400).json({ 
      message: "Error al actualizar el plan: " + err.message 
    });
  }
});

// ✅ DELETE: Eliminar plan individual
router.delete('/:id', getPlanIntegralDocente, async (req, res) => {
  try {
    await res.planIntegralDocente.deleteOne();
    res.json({ message: 'Plan eliminado exitosamente' });
  } catch (err) {
    console.error("Error al eliminar el plan:", err);
    res.status(500).json({ 
      message: "Error al eliminar el plan: " + err.message 
    });
  }
});

module.exports = router;