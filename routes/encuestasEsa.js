const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const EncuestaEsa = require('../models/EncuestaEsa');

// ✅ GET: Exportar datos para Excel (sin paginación)
router.get('/export', async (req, res) => {
  try {
    const { 
      dni,
      campus,
      codBanner,
      semestre,
      grupoDocente,
      tipoDeEncuesta,
      modalidad,
      programa,
      formato = 'completo' // 'completo' o 'basico'
    } = req.query;
    
    // Construir query de filtros (igual que el endpoint principal)
    const query = {};
    if (dni) query.dni = dni;
    if (campus) query.campus = new RegExp(campus, 'i');
    if (codBanner) query.codBanner = codBanner;
    if (semestre) query.semestre = semestre;
    if (grupoDocente) query.grupoDocente = new RegExp(grupoDocente, 'i');
    if (tipoDeEncuesta) query.tipoDeEncuesta = new RegExp(tipoDeEncuesta, 'i');
    if (modalidad) query.modalidad = new RegExp(modalidad, 'i');
    if (programa) query.programa = new RegExp(programa, 'i');
    
    console.log(`📊 Exportando encuestas ESA para Excel. Filtros aplicados:`, query);
    
    // Obtener TODOS los registros sin límite ni paginación
    const encuestas = await EncuestaEsa.find(query)
      .sort({ dni: 1, campus: 1 })
      .lean(); // lean() para mejor performance
    
    // Formatear datos según el tipo solicitado
    let datosExport;
    
    if (formato === 'basico') {
      // Formato básico - solo campos esenciales para encuestas ESA
      datosExport = encuestas.map(encuesta => ({
        'DNI': encuesta.dni,
        'Nombre Docente': encuesta.nombreDocente,
        'Campus': encuesta.campus,
        'Código Banner': encuesta.codBanner,
        'Código Payroll': encuesta.codPayroll,
        'Grupo Docente': encuesta.grupoDocente,
        'Tipo de Encuesta': encuesta.tipoDeEncuesta,
        'Modalidad': encuesta.modalidad,
        'Programa': encuesta.programa,
        'Total Matriculados': encuesta.totalMatriculados,
        'Total Encuestados': encuesta.totalEncuestados,
        'Porcentaje Cobertura': encuesta.porcentajeCobertura,
        'Promedio ESA': encuesta.promedioEsa,
        'Promedio NPS': encuesta.promedioNps,
        'Ranking': encuesta.ranking,
        'Semestre': encuesta.semestre,
        'Fecha Carga': encuesta.fechaCarga
      }));
    } else {
      // Formato completo - TODOS los campos del modelo
      datosExport = encuestas.map(encuesta => ({
        // Información básica del registro
        'ID Registro': encuesta._id,
        'Semestre': encuesta.semestre,
        'Fecha Carga': encuesta.fechaCarga,
        
        // Información del docente y contexto
        'Grupo Docente': encuesta.grupoDocente,
        'Tipo de Encuesta': encuesta.tipoDeEncuesta,
        'Modalidad': encuesta.modalidad,
        'Programa': encuesta.programa,
        'Módulo': encuesta.modulo,
        'Campus': encuesta.campus,
        
        // Identificadores del docente
        'Código Banner': encuesta.codBanner,
        'Código Payroll': encuesta.codPayroll,
        'DNI': encuesta.dni,
        'Nombre Docente': encuesta.nombreDocente,
        
        // Estadísticas de participación
        'Total Matriculados': encuesta.totalMatriculados,
        'Total Encuestados': encuesta.totalEncuestados,
        'Porcentaje Cobertura': encuesta.porcentajeCobertura,
        
        // Resultados de preguntas específicas
        'Pregunta NPS': encuesta.preguntaNps,
        'Pregunta Contribución Aprendizaje': encuesta.preguntaContribAprendizaje,
        'Promedio ESA': encuesta.promedioEsa,
        'Escala': encuesta.escala,
        
        // Análisis NPS detallado
        'N° Detractores NPS': encuesta.nDetractoresNps,
        'N° Neutros NPS': encuesta.nNeutrosNps,
        'N° Promotores NPS': encuesta.nPromotoresNps,
        'Promedio NPS': encuesta.promedioNps,
        'Ranking': encuesta.ranking,
        
        // Metadatos del sistema
        'Fecha Creación': encuesta.createdAt ? new Date(encuesta.createdAt).toLocaleDateString('es-PE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : '',
        'Última Actualización': encuesta.updatedAt ? new Date(encuesta.updatedAt).toLocaleDateString('es-PE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : ''
      }));
    }
    
    // Estadísticas del export
    const encuestasConDatos = encuestas.filter(e => e.totalMatriculados > 0 || e.totalEncuestados > 0);
    const encuestasConESA = encuestas.filter(e => e.promedioEsa !== null && e.promedioEsa !== undefined);
    const encuestasConNPS = encuestas.filter(e => e.promedioNps !== null && e.promedioNps !== undefined);
    
    const stats = {
      totalEncuestas: encuestas.length,
      docentesUnicos: [...new Set(encuestas.map(e => e.dni).filter(dni => dni))].length,
      campusUnicos: [...new Set(encuestas.map(e => e.campus).filter(campus => campus))].length,
      programasUnicos: [...new Set(encuestas.map(e => e.programa).filter(programa => programa))].length,
      tiposEncuestaUnicos: [...new Set(encuestas.map(e => e.tipoDeEncuesta).filter(tipo => tipo))].length,
      semestres: [...new Set(encuestas.map(e => e.semestre).filter(semestre => semestre))],
      fechaUltimaCarga: encuestas[0]?.fechaCarga || null,
      
      // Estadísticas de participación
      totalMatriculados: encuestas.reduce((sum, e) => sum + (e.totalMatriculados || 0), 0),
      totalEncuestados: encuestas.reduce((sum, e) => sum + (e.totalEncuestados || 0), 0),
      promedioCobertura: encuestasConDatos.length > 0 ? 
        (encuestasConDatos.reduce((sum, e) => sum + (e.porcentajeCobertura || 0), 0) / encuestasConDatos.length).toFixed(2) : null,
      
      // Estadísticas ESA
      promedioESAGeneral: encuestasConESA.length > 0 ? 
        (encuestasConESA.reduce((sum, e) => sum + (e.promedioEsa || 0), 0) / encuestasConESA.length).toFixed(2) : null,
      encuestasConESA: encuestasConESA.length,
      
      // Estadísticas NPS
      promedioNPSGeneral: encuestasConNPS.length > 0 ? 
        (encuestasConNPS.reduce((sum, e) => sum + (e.promedioNps || 0), 0) / encuestasConNPS.length).toFixed(2) : null,
      encuestasConNPS: encuestasConNPS.length,
      totalDetractores: encuestas.reduce((sum, e) => sum + (e.nDetractoresNps || 0), 0),
      totalNeutros: encuestas.reduce((sum, e) => sum + (e.nNeutrosNps || 0), 0),
      totalPromotores: encuestas.reduce((sum, e) => sum + (e.nPromotoresNps || 0), 0)
    };
    
    console.log(`✅ Export de encuestas ESA preparado: ${datosExport.length} registros`);
    
    res.json({
      success: true,
      mensaje: `Encuestas ESA preparadas para exportación a Excel`,
      datos: datosExport,
      estadisticas: stats,
      metadatos: {
        fechaExport: new Date().toISOString(),
        formatoSolicitado: formato,
        filtrosAplicados: query,
        camposIncluidos: formato === 'basico' ? 17 : Object.keys(datosExport[0] || {}).length
      }
    });
    
  } catch (err) {
    console.error('💥 Error en exportación de encuestas ESA:', err);
    res.status(500).json({ 
      success: false,
      message: 'Error al preparar encuestas ESA para exportación', 
      error: err.message 
    });
  }
});

// ✅ GET: Reporte corregido con campos consistentes
router.get('/reporte', async (req, res) => {
  try {
    const reporte = await EncuestaEsa.aggregate([
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

// ✅ GET: Obtener encuestas con filtros mejorados
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      dni,
      campus,
      codBanner,
      semestre
    } = req.query;

    const query = {};

    if (dni) query.dni = dni;
    if (campus) query.campus = new RegExp(campus, 'i');
    if (codBanner) query.codBanner = codBanner;
    if (semestre) query.semestre = semestre;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [encuestas, total] = await Promise.all([
      EncuestaEsa.find(query)
        .sort({ dni: 1, campus: 1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      EncuestaEsa.countDocuments(query)
    ]);

    res.json({
      data: encuestas,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalDocs: total,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      },
      fechaUltimaCarga: encuestas[0]?.fechaCarga || null
    });

  } catch (err) {
    console.error("Error al obtener las encuestas:", err);
    res.status(500).json({
      message: "Error al obtener las encuestas",
      error: err.message
    });
  }
});

// ✅ GET: Encuestas de un docente específico por DNI
router.get('/docente/:dni', async (req, res) => {
  try {
    const { dni } = req.params;

    const encuestas = await EncuestaEsa.find({ dni })
      .sort({ fechaCarga: -1 })
      .lean();

    if (encuestas.length === 0) {
      return res.status(404).json({
        message: `No se encontraron encuestas para el docente con DNI ${dni}`
      });
    }

    res.json({
      dni: dni,
      nombre: encuestas[0].nombre || 'N/A',
      semestre: encuestas[0].semestre,
      totalEncuestas: encuestas.length,
      encuestas: encuestas,
      fechaUltimaCarga: encuestas[0].fechaCarga
    });

  } catch (err) {
    console.error('Error al obtener encuestas del docente:', err);
    res.status(500).json({
      message: 'Error al obtener encuestas del docente',
      error: err.message
    });
  }
});

// Agregar esta función después de la inserción exitosa en tu router.post('/bulk')
async function convertirCodBannerAMayusculas(semestre) {
  try {
    console.log(`🔄 Convirtiendo codBanner a mayúsculas para semestre: ${semestre}`);

    const result = await EncuestaEsa.updateMany(
      {
        semestre: semestre,
        codBanner: { $exists: true, $ne: null }
      },
      [
        {
          $set: {
            codBanner: { $toUpper: "$codBanner" }
          }
        }
      ]
    );

    console.log(`✅ Actualizados ${result.modifiedCount} registros con codBanner en mayúsculas`);
    return result;

  } catch (err) {
    console.error('❌ Error al convertir codBanner a mayúsculas:', err);
    throw err;
  }
}


// ✅ POST: Carga masiva UNIFICADA - LIMPIA y REEMPLAZA totalmente
// ✅ POST: Carga masiva UNIFICADA - LIMPIA y REEMPLAZA totalmente - CORREGIDO
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

  console.log(`📅 Reemplazando COMPLETAMENTE encuestas del semestre ${semestre} con fecha ${fechaCarga}: ${registrosNuevos.length} registros`);

  try {
    // 1. 🗑️ ELIMINAR TODAS las encuestas anteriores del mismo semestre (LIMPIEZA COMPLETA)
    console.log(`🗑️ Eliminando TODAS las encuestas anteriores del semestre ${semestre}...`);
    const deleteResult = await EncuestaEsa.deleteMany({ semestre });
    console.log(`✅ Eliminados: ${deleteResult.deletedCount} registros antiguos`);

    // 2. ➕ INSERTAR TODAS las nuevas encuestas (REEMPLAZO COMPLETO)
    console.log(`➕ Insertando TODAS las nuevas encuestas con fecha: ${fechaCarga}...`);
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
        const insertResult = await EncuestaEsa.insertMany(lote, {
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

    // 3. 🔄 CONVERTIR codBanner a mayúsculas (ANTES de enviar respuesta)
    let codBannerActualizados = 0;
    if (totalInsertados > 0) {
      console.log(`🔄 Convirtiendo codBanner a mayúsculas...`);
      try {
        const uppercaseResult = await convertirCodBannerAMayusculas(semestre);
        codBannerActualizados = uppercaseResult.modifiedCount;
        console.log(`✅ Conversión completada: ${codBannerActualizados} códigos convertidos`);
      } catch (uppercaseErr) {
        console.error('⚠️ Error en conversión de mayúsculas (no crítico):', uppercaseErr);
        // No fallar todo por este error, solo registrarlo
      }
    }

    // 4. ✅ CONSTRUIR RESPUESTA COMPLETA
    const response = {
      message: `Encuestas del semestre ${semestre} REEMPLAZADAS COMPLETAMENTE con fecha ${fechaCarga}`,
      fechaCarga: fechaCarga,
      fechaProcesamiento: new Date().toISOString().split('T')[0],
      semestre: semestre,
      operacion: 'REEMPLAZO_COMPLETO',
      registrosProcesados: registrosNuevos.length,
      registrosInsertados: totalInsertados,
      registrosFallidos: totalFallidos,
      registrosEliminados: deleteResult.deletedCount,
      codBannerActualizados: codBannerActualizados,
      estado: totalFallidos === 0 ? 'EXITOSA' : 'PARCIAL'
    };

    // Agregar mensaje sobre conversión de mayúsculas
    if (codBannerActualizados > 0) {
      response.message += ` - ${codBannerActualizados} códigos convertidos a mayúsculas`;
    }

    if (errores.length > 0) {
      response.erroresMuestra = errores.slice(0, 5); // Máximo 5 errores
    }

    // 5. 📤 ENVIAR RESPUESTA (SOLO UNA VEZ)
    if (totalFallidos > 0) {
      res.status(207).json(response); // 207 Multi-Status
    } else {
      res.status(201).json(response); // 201 Created
    }

  } catch (err) {
    console.error(`💥 Error en reemplazo completo de encuestas ${fechaCarga}:`, err);

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

// ✅ Función auxiliar mejorada con mejor manejo de errores
async function convertirCodBannerAMayusculas(semestre) {
  try {
    console.log(`🔄 Convirtiendo codBanner a mayúsculas para semestre: ${semestre}`);

    const result = await EncuestaEsa.updateMany(
      {
        semestre: semestre,
        codBanner: { $exists: true, $ne: null, $ne: "" }
      },
      [
        {
          $set: {
            codBanner: { $toUpper: "$codBanner" }
          }
        }
      ]
    );

    console.log(`✅ Actualizados ${result.modifiedCount} registros con codBanner en mayúsculas`);
    return result;

  } catch (err) {
    console.error('❌ Error al convertir codBanner a mayúsculas:', err);
    throw err;
  }
}

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

    const stats = await EncuestaEsa.collection.stats();

    res.json({
      baseDatos: {
        nombre: mongoose.connection.name,
        coleccion: EncuestaEsa.collection.collectionName,
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
    const result = await EncuestaEsa.deleteMany(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: `No se encontraron encuestas para eliminar con semestre: ${semestre} y fecha: ${fechaCarga}`,
        deletedCount: 0
      });
    }

    res.status(200).json({
      message: `Se eliminaron ${result.deletedCount} encuestas del semestre ${semestre}`,
      deletedCount: result.deletedCount,
      semestre: semestre,
      fechaCarga: fechaCarga
    });

  } catch (err) {
    console.error('Error al eliminar encuestas:', err);
    res.status(500).json({
      message: "Error interno del servidor",
      error: err.message
    });
  }
});

// ✅ GET: Verificar estado de las encuestas
router.get('/estado', async (req, res) => {
  try {
    const { semestre } = req.query;

    let query = {};
    if (semestre) query.semestre = semestre;

    const ultimaEncuesta = await EncuestaEsa.findOne(query, {
      fechaCarga: 1,
      semestre: 1
    })
      .sort({ fechaCarga: -1 })
      .lean();

    const totalEncuestas = await EncuestaEsa.countDocuments(query);

    const hoy = new Date().toISOString().split('T')[0];
    const esActual = ultimaEncuesta?.fechaCarga === hoy;

    res.json({
      estado: esActual ? 'ACTUALIZADA' : 'DESACTUALIZADA',
      fechaUltimaCarga: ultimaEncuesta?.fechaCarga || null,
      fechaHoy: hoy,
      semestre: ultimaEncuesta?.semestre || semestre || 'N/A',
      totalEncuestas: totalEncuestas,
      mensaje: esActual ?
        'Las encuestas están actualizadas' :
        `Las encuestas necesitan actualizarse. Última carga: ${ultimaEncuesta?.fechaCarga || 'Nunca'}`
    });

  } catch (err) {
    console.error('Error al verificar estado:', err);
    res.status(500).json({
      message: 'Error al verificar estado',
      error: err.message
    });
  }
});

// ✅ POST: Crear una nueva encuesta individual
router.post('/', async (req, res) => {
  const encuesta = new EncuestaEsa(req.body);
  try {
    const nuevaEncuesta = await encuesta.save();
    res.status(201).json(nuevaEncuesta);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({
        message: "Error de validación al crear la encuesta.",
        errors
      });
    }
    if (err.code === 11000) {
      return res.status(409).json({
        message: "Error: Ya existe un registro con algunos de los datos únicos proporcionados.",
        details: err.keyValue
      });
    }
    console.error("Error al crear la encuesta:", err);
    res.status(400).json({
      message: "Error al crear la encuesta: " + err.message
    });
  }
});

// ✅ Middleware para operaciones individuales
async function getEncuestaEsa(req, res, next) {
  let encuesta;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de encuesta no válido' });
    }

    encuesta = await EncuestaEsa.findById(req.params.id);

    if (encuesta == null) {
      return res.status(404).json({
        message: 'No se pudo encontrar la encuesta con el ID proporcionado.'
      });
    }
  } catch (err) {
    console.error("Error en middleware getEncuestaEsa:", err);
    return res.status(500).json({
      message: "Error interno del servidor: " + err.message
    });
  }

  res.encuestaEsa = encuesta;
  next();
}

// ✅ GET: Una encuesta por ID
router.get('/:id', getEncuestaEsa, (req, res) => {
  res.json(res.encuestaEsa);
});

// ✅ PUT: Actualizar encuesta individual
router.put('/:id', getEncuestaEsa, async (req, res) => {
  Object.assign(res.encuestaEsa, req.body);
  try {
    const encuestaActualizada = await res.encuestaEsa.save({ runValidators: true });
    res.json(encuestaActualizada);
  } catch (err) {
    if (err.name === 'ValidationError') {
      let errors = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });
      return res.status(400).json({
        message: "Error de validación al actualizar la encuesta.",
        errors
      });
    }
    if (err.code === 11000) {
      return res.status(409).json({
        message: "Error: Intento de actualizar a un valor que viola una restricción única.",
        details: err.keyValue
      });
    }
    console.error("Error al actualizar la encuesta:", err);
    res.status(400).json({
      message: "Error al actualizar la encuesta: " + err.message
    });
  }
});

// ✅ DELETE: Eliminar encuesta individual
router.delete('/:id', getEncuestaEsa, async (req, res) => {
  try {
    await res.encuestaEsa.deleteOne();
    res.json({ message: 'Encuesta eliminada exitosamente' });
  } catch (err) {
    console.error("Error al eliminar la encuesta:", err);
    res.status(500).json({
      message: "Error al eliminar la encuesta: " + err.message
    });
  }
});

module.exports = router;