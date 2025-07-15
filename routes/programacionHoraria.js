const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ProgramacionHoraria = require('../models/ProgramacionHoraria');

// ✅ GET: Reporte corregido con campos consistentes
router.get('/reporte', async (req, res) => {
  try {
    const reporte = await ProgramacionHoraria.aggregate([
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

// ✅ GET: Exportar datos para Excel (sin paginación)
router.get('/export', async (req, res) => {
  try {
    const { 
      docente,
      curso,
      dia,
      campus,
      semestre,
      idDocente,
      formato = 'completo' // 'completo' o 'basico'
    } = req.query;
    
    // Construir query de filtros (igual que el endpoint principal)
    const query = {};
    if (idDocente) query.idDocente = idDocente;
    if (docente) query.docente = new RegExp(docente, 'i');
    if (curso) query.nombreCurso = new RegExp(curso, 'i');
    if (dia) query.dia = dia.toUpperCase();
    if (campus) query.campus = campus.toUpperCase();
    if (semestre) query.semestre = semestre;
    
    console.log(`📊 Exportando datos para Excel. Filtros aplicados:`, query);
    
    // Obtener TODOS los registros sin límite ni paginación
    const programacion = await ProgramacionHoraria.find(query)
      .sort({ docente: 1, nombreCurso: 1, dia: 1, hora: 1 })
      .lean(); // lean() para mejor performance
    
    // Formatear datos según el tipo solicitado
    let datosExport;
    
    if (formato === 'basico') {
      // Formato básico - solo campos esenciales para horarios
      datosExport = programacion.map(registro => ({
        'ID Docente': registro.idDocente,
        'Docente': registro.docente,
        'Curso': registro.nombreCurso,
        'Código Curso': registro.codCurso,
        'NRC': registro.nrc,
        'Sección': registro.seccion,
        'Día': registro.dia,
        'Hora': registro.hora,
        'Campus': registro.campus,
        'Aula': registro.aula,
        'Semestre': registro.semestre
      }));
    } else {
      // Formato completo - TODOS los campos del modelo
      datosExport = programacion.map(registro => ({
        // Información básica del registro
        'ID Registro': registro._id,
        'Semestre': registro.semestre,
        'Fecha Carga': registro.fechaCarga,
        'Período': registro.periodo,
        
        // Información institucional
        'Campus': registro.campus,
        'Facultad': registro.facultad,
        
        // Información del curso
        'Código Dueño Curso': registro.codDuenioCurso,
        'Dueño Curso': registro.duenioCurso,
        'Código Curso': registro.codCurso,
        'Nombre Curso': registro.nombreCurso,
        'Horas Plan Curso': registro.hrsPlanCurso,
        'NRC': registro.nrc,
        'Sección': registro.seccion,
        'Estatus': registro.estatus,
        'Lista Cruzada': registro.lstCrz,
        'Origen Lista Cruzada': registro.origenLstCrz,
        'Sobrepaso Aula': registro.sobrepasoAula,
        'Tipo Horario': registro.tipHor,
        'Método Educativo': registro.metEdu,
        
        // Capacidad y matrícula
        'Máximo Alumnos': registro.maximo,
        'Alumnos Reales': registro.real,
        'Alumnos Restantes': registro.restante,
        'Horas Crédito': registro.hrsCredito,
        
        // Información del docente
        'ID Docente': registro.idDocente,
        'ID RRHH': registro.idRrhh,
        'Docente': registro.docente,
        'ID Principal': registro.idPrinc,
        'Tipo Jornada': registro.tipoJornada,
        'Estado Docente': registro.estadoDocente,
        'Motivo': registro.motivo,
        
        // Fechas del curso
        'Fecha Inicio': registro.fechaInicio,
        'Fecha Fin': registro.fechaFin,
        
        // Horario y ubicación
        'Día': registro.dia,
        'Hora': registro.hora,
        'Turno': registro.turno,
        'Edificio': registro.edificio,
        'Aula': registro.aula,
        'Tipo Ambiente': registro.tipoAmbiente,
        
        // Programas y requisitos
        'In/Ex Programa': registro.inExPrograma,
        'Código Programas Compartidos': registro.codProgramasCompartidos,
        'Programas Compartidos': registro.programasCompartidos,
        'In/Ex Campus': registro.inExCampus,
        'Campus 2': registro.campus2,
        'Tipo Requisito': registro.tipoRequisito,
        'Requisitos': registro.requisitos,
        'Bloques Horarios': registro.bloquesHorarios,
        
        // Atributos y cohortes
        'In/Ex Atributo': registro.inExAtributo,
        'Atributos': registro.atributos,
        'In/Ex Cohorte': registro.inExCohorte,
        'Cohortes': registro.cohortes,
        'Atributos Bolsón': registro.atributosBolson,
        
        // Metadatos del sistema
        'Fecha Creación': registro.createdAt ? new Date(registro.createdAt).toLocaleDateString('es-PE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : '',
        'Última Actualización': registro.updatedAt ? new Date(registro.updatedAt).toLocaleDateString('es-PE', {
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
      totalRegistros: programacion.length,
      docentesUnicos: [...new Set(programacion.map(r => r.docente))].length,
      cursosUnicos: [...new Set(programacion.map(r => r.nombreCurso))].length,
      campusUnicos: [...new Set(programacion.map(r => r.campus))].length,
      semestres: [...new Set(programacion.map(r => r.semestre))],
      fechaUltimaCarga: programacion[0]?.fechaCarga || null
    };
    
    console.log(`✅ Export preparado: ${datosExport.length} registros`);
    
    res.json({
      success: true,
      mensaje: `Datos preparados para exportación a Excel`,
      datos: datosExport,
      estadisticas: stats,
      metadatos: {
        fechaExport: new Date().toISOString(),
        formatoSolicitado: formato,
        filtrosAplicados: query,
        camposIncluidos: formato === 'basico' ? 7 : Object.keys(datosExport[0] || {}).length
      }
    });
    
  } catch (err) {
    console.error('💥 Error en exportación:', err);
    res.status(500).json({ 
      success: false,
      message: 'Error al preparar datos para exportación', 
      error: err.message 
    });
  }
});

// ✅ GET: Exportar por docente específico
router.get('/export/docente/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { formato = 'completo' } = req.query;
    
    const programacion = await ProgramacionHoraria.find({ idDocente: id })
      .sort({ dia: 1, hora: 1 })
      .lean();
      
    if (programacion.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: `No se encontró programación para el docente ${id}` 
      });
    }
    
    // Formatear datos para el docente - con campos del modelo real
    const datosExport = programacion.map(registro => ({
      'ID Docente': registro.idDocente,
      'Docente': registro.docente,
      'Código Curso': registro.codCurso,
      'Nombre Curso': registro.nombreCurso,
      'NRC': registro.nrc,
      'Sección': registro.seccion,
      'Día': registro.dia,
      'Hora': registro.hora,
      'Turno': registro.turno,
      'Campus': registro.campus,
      'Edificio': registro.edificio,
      'Aula': registro.aula,
      'Facultad': registro.facultad,
      'Máximo Alumnos': registro.maximo,
      'Alumnos Reales': registro.real,
      'Horas Crédito': registro.hrsCredito,
      'Estatus': registro.estatus,
      'Tipo Jornada': registro.tipoJornada,
      'Estado Docente': registro.estadoDocente,
      'Fecha Inicio': registro.fechaInicio,
      'Fecha Fin': registro.fechaFin,
      'Semestre': registro.semestre,
      'Fecha Carga': registro.fechaCarga
    }));
    
    // Resumen por días
    const resumenPorDia = programacion.reduce((acc, clase) => {
      if (!acc[clase.dia]) acc[clase.dia] = [];
      acc[clase.dia].push({
        curso: clase.nombreCurso,
        hora: clase.hora,
        campus: clase.campus,
        aula: clase.aula || 'N/A'
      });
      return acc;
    }, {});
    
    res.json({
      success: true,
      datos: datosExport,
      resumen: {
        idDocente: id,
        nombreDocente: programacion[0].docente,
        totalClases: programacion.length,
        semestre: programacion[0].semestre,
        fechaUltimaCarga: programacion[0].fechaCarga,
        programacionPorDia: resumenPorDia
      },
      metadatos: {
        fechaExport: new Date().toISOString(),
        tipo: 'export_docente'
      }
    });
    
  } catch (err) {
    console.error('Error en exportación por docente:', err);
    res.status(500).json({ 
      success: false,
      message: 'Error al exportar programación del docente', 
      error: err.message 
    });
  }
});

// ✅ GET: Plantilla Excel con estructura de campos
router.get('/export/template', async (req, res) => {
  try {
    // Obtener un registro ejemplo para mostrar la estructura
    const ejemplo = await ProgramacionHoraria.findOne().lean();
    
    const plantilla = {
      // Información básica
      'Semestre': '2025-1',
      'Fecha Carga': '2025-07-14',
      'Período': 'REGULAR',
      'Campus': 'PRINCIPAL',
      'Facultad': 'INGENIERÍA',
      
      // Curso
      'Código Dueño Curso': 'ING',
      'Dueño Curso': 'Ingeniería',
      'Código Curso': 'MAT101',
      'Nombre Curso': 'Matemáticas I',
      'Horas Plan Curso': 4,
      'NRC': '12345',
      'Sección': '001',
      'Estatus': 'ACTIVO',
      'Horas Crédito': 3,
      
      // Capacidad
      'Máximo Alumnos': 30,
      'Alumnos Reales': 25,
      'Alumnos Restantes': 5,
      
      // Docente
      'ID Docente': 'DOC001',
      'ID RRHH': 'RRHH001',
      'Docente': 'Juan Pérez López',
      'Tipo Jornada': 'COMPLETA',
      'Estado Docente': 'ACTIVO',
      
      // Horario
      'Día': 'LUNES',
      'Hora': '08:00-10:00',
      'Turno': 'MAÑANA',
      'Edificio': 'A',
      'Aula': 'A-101',
      'Fecha Inicio': '2025-03-01',
      'Fecha Fin': '2025-07-15'
    };
    
    const camposDisponibles = ejemplo ? Object.keys(ejemplo).filter(key => key !== '_id' && key !== '__v') : [];
    
    res.json({
      success: true,
      plantilla: [plantilla],
      camposDisponibles: camposDisponibles,
      instrucciones: {
        formato: 'Los datos deben seguir exactamente esta estructura',
        fechaCarga: 'Formato: YYYY-MM-DD',
        dia: 'Usar: LUNES, MARTES, MIÉRCOLES, JUEVES, VIERNES, SÁBADO, DOMINGO',
        campus: 'Usar mayúsculas: PRINCIPAL, NORTE, SUR, etc.',
        hora: 'Formato 24 horas: HH:MM'
      }
    });
    
  } catch (err) {
    console.error('Error al generar plantilla:', err);
    res.status(500).json({ 
      success: false,
      message: 'Error al generar plantilla', 
      error: err.message 
    });
  }
});


// ✅ GET: Obtener programación actual con filtros mejorados
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 100,
      docente,
      curso,
      dia,
      campus,
      semestre,
      idDocente
    } = req.query;
    
    const query = {};
    
    if (idDocente) query.idDocente = idDocente;
    if (docente) query.docente = new RegExp(docente, 'i');
    if (curso) query.nombreCurso = new RegExp(curso, 'i');
    if (dia) query.dia = dia.toUpperCase();
    if (campus) query.campus = campus.toUpperCase();
    if (semestre) query.semestre = semestre;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [programacion, total] = await Promise.all([
      ProgramacionHoraria.find(query)
        .sort({ docente: 1, nombreCurso: 1, dia: 1, hora: 1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      ProgramacionHoraria.countDocuments(query)
    ]);
    
    res.json({
      data: programacion,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalDocs: total,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      },
      fechaUltimaCarga: programacion[0]?.fechaCarga || null
    });
    
  } catch (err) {
    console.error("Error al obtener los registros:", err);
    res.status(500).json({ 
      message: "Error al obtener los registros", 
      error: err.message 
    });
  }
});

// ✅ GET: Programación de un docente específico
router.get('/docente/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const programacion = await ProgramacionHoraria.find({ idDocente: id })
      .sort({ dia: 1, hora: 1 })
      .lean();
      
    if (programacion.length === 0) {
      return res.status(404).json({ 
        message: `No se encontró programación para el docente ${id}` 
      });
    }
    
    const programacionPorDia = programacion.reduce((acc, clase) => {
      if (!acc[clase.dia]) acc[clase.dia] = [];
      acc[clase.dia].push(clase);
      return acc;
    }, {});
    
    res.json({
      idDocente: id,
      docente: programacion[0].docente,
      semestre: programacion[0].semestre,
      totalClases: programacion.length,
      programacionPorDia: programacionPorDia,
      fechaUltimaCarga: programacion[0].fechaCarga
    });
    
  } catch (err) {
    console.error('Error al obtener programación del docente:', err);
    res.status(500).json({ 
      message: 'Error al obtener programación del docente', 
      error: err.message 
    });
  }
});

// ✅ POST: Carga masiva UNIFICADA - soporta ambos formatos
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
  
  console.log(`📅 Cargando programación del ${fechaCarga} para semestre ${semestre}: ${registrosNuevos.length} registros`);
  
  try {
    // 1. 🗑️ ELIMINAR programación anterior del mismo semestre
    console.log(`🗑️ Eliminando programación anterior del semestre ${semestre}...`);
    const deleteResult = await ProgramacionHoraria.deleteMany({ semestre });
    console.log(`✅ Eliminados: ${deleteResult.deletedCount} registros`);
    
    // 2. ➕ INSERTAR nueva programación
    console.log(`➕ Insertando nueva programación con fecha: ${fechaCarga}...`);
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
        const insertResult = await ProgramacionHoraria.insertMany(lote, { 
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
    
    console.log(`🎉 Inserción completada: ${totalInsertados} exitosos, ${totalFallidos} fallidos`);
    
    // ✅ RESPUESTA DE ÉXITO
    const response = {
      message: `Programación del ${fechaCarga} cargada para semestre ${semestre}`,
      fechaCarga: fechaCarga,
      fechaProcesamiento: new Date().toISOString().split('T')[0],
      semestre: semestre,
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
    console.error(`💥 Error en carga de programación ${fechaCarga}:`, err);
    
    res.status(500).json({
      message: 'Error crítico durante la carga masiva',
      fechaCarga: fechaCarga,
      semestre: semestre,
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
    
    const stats = await ProgramacionHoraria.collection.stats();
    
    res.json({
      baseDatos: {
        nombre: mongoose.connection.name,
        coleccion: ProgramacionHoraria.collection.collectionName,
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
    const result = await ProgramacionHoraria.deleteMany(filter);
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: `No se encontraron registros para eliminar con semestre: ${semestre} y fecha: ${fechaCarga}`,
        deletedCount: 0
      });
    }
    
    res.status(200).json({
      message: `Se eliminaron ${result.deletedCount} registros del semestre ${semestre}`,
      deletedCount: result.deletedCount,
      semestre: semestre,
      fechaCarga: fechaCarga
    });
    
  } catch (err) {
    console.error('Error al eliminar registros:', err);
    res.status(500).json({ 
      message: "Error interno del servidor",
      error: err.message 
    });
  }
});

// ✅ GET: Verificar estado de la programación
router.get('/estado', async (req, res) => {
  try {
    const { semestre } = req.query;
    
    let query = {};
    if (semestre) query.semestre = semestre;
    
    const ultimoRegistro = await ProgramacionHoraria.findOne(query, { 
      fechaCarga: 1, 
      semestre: 1 
    })
    .sort({ fechaCarga: -1 })
    .lean();
      
    const totalRegistros = await ProgramacionHoraria.countDocuments(query);
    
    const hoy = new Date().toISOString().split('T')[0];
    const esActual = ultimoRegistro?.fechaCarga === hoy;
    
    res.json({
      estado: esActual ? 'ACTUALIZADA' : 'DESACTUALIZADA',
      fechaUltimaCarga: ultimoRegistro?.fechaCarga || null,
      fechaHoy: hoy,
      semestre: ultimoRegistro?.semestre || semestre || 'N/A',
      totalRegistros: totalRegistros,
      mensaje: esActual ? 
        'La programación está actualizada' : 
        `La programación necesita actualizarse. Última carga: ${ultimoRegistro?.fechaCarga || 'Nunca'}`
    });
    
  } catch (err) {
    console.error('Error al verificar estado:', err);
    res.status(500).json({ 
      message: 'Error al verificar estado', 
      error: err.message 
    });
  }
});

// ✅ Middleware para operaciones individuales
async function getDocenteCarga(req, res, next) {
  let docenteCarga;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de registro no válido' });
    }
    
    docenteCarga = await ProgramacionHoraria.findById(req.params.id);
    
    if (docenteCarga == null) {
      return res.status(404).json({ 
        message: 'No se pudo encontrar el registro con el ID proporcionado.' 
      });
    }
  } catch (err) {
    console.error("Error en middleware getDocenteCarga:", err);
    return res.status(500).json({ 
      message: "Error interno del servidor: " + err.message 
    });
  }
  
  res.docenteCarga = docenteCarga;
  next();
}

// ✅ GET: Un registro por ID
router.get('/:id', getDocenteCarga, (req, res) => {
  res.json(res.docenteCarga);
});

// ✅ PUT: Actualizar registro individual
router.put('/:id', getDocenteCarga, async (req, res) => {
  Object.assign(res.docenteCarga, req.body);
  try {
    const registroActualizado = await res.docenteCarga.save();
    res.json(registroActualizado);
  } catch (err) {
    console.error("Error al actualizar:", err);
    res.status(400).json({ 
      message: "Error al actualizar el registro: " + err.message 
    });
  }
});

// ✅ DELETE: Eliminar registro individual
router.delete('/:id', getDocenteCarga, async (req, res) => {
  try {
    await res.docenteCarga.deleteOne();
    res.json({ message: 'Registro eliminado exitosamente' });
  } catch (err) {
    console.error("Error al eliminar:", err);
    res.status(500).json({ 
      message: "Error al eliminar el registro: " + err.message 
    });
  }
});

module.exports = router;