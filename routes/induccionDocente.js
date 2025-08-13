const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const InduccionDocente = require('../models/InduccionDocente'); // Asegúrate que la ruta al modelo sea correcta

// ✅ GET: Exportar datos para Excel (sin paginación)
router.get('/export', async (req, res) => {
  try {
    const { 
      dni,
      semestre,
      facultad,
      sede_ingreso,
      nivel,
      tipo_dictado,
      formato = 'completo' // 'completo' o 'basico'
    } = req.query;
    
    // Construir query de filtros
    const query = {};
    if (dni) query.dni = new RegExp(dni, 'i');
    if (semestre) query.semestre = semestre;
    if (facultad) query.facultad = new RegExp(facultad, 'i');
    if (sede_ingreso) query.sede_ingreso = new RegExp(sede_ingreso, 'i');
    if (nivel) query.nivel = new RegExp(nivel, 'i');
    if (tipo_dictado) query.tipo_dictado = new RegExp(tipo_dictado, 'i');
    
    console.log(`📊 Exportando datos de inducción para Excel. Filtros aplicados:`, query);
    
    // Obtener TODOS los registros sin límite ni paginación
    const docentes = await InduccionDocente.find(query)
      .sort({ apellido_paterno: 1, apellido_materno: 1 })
      .lean(); // lean() para mejor performance
      
    let datosExport;
    
    if (formato === 'basico') {
      // Formato básico - solo campos esenciales
      datosExport = docentes.map(docente => ({
        'DNI': docente.dni,
        'Nombre Completo': `${docente.apellido_paterno} ${docente.apellido_materno}, ${docente.primer_nombre} ${docente.segundo_nombre || ''}`.trim(),
        'Correo': docente.correo_contacto,
        'Teléfono': docente.telefono_contacto,
        'Sede Ingreso': docente.sede_ingreso,
        'Facultad': docente.facultad,
        'Cargo Ingreso': docente.cargo_ingreso,
        'Semestre': docente.semestre,
        'Fecha Carga': docente.fechaCarga,
      }));
    } else {
      // Formato completo - TODOS los campos del modelo
      datosExport = docentes.map(docente => ({
        'ID Registro': docente._id,
        'Semestre': docente.semestre,
        'Fecha Carga': docente.fechaCarga,
        'DNI': docente.dni,
        'Id Docente': docente.idDocente,
        'Nivel': docente.nivel,
        'Tipo Dictado': docente.tipo_dictado,
        'Primer Nombre': docente.primer_nombre,
        'Segundo Nombre': docente.segundo_nombre,
        'Apellido Paterno': docente.apellido_paterno,
        'Apellido Materno': docente.apellido_materno,
        'Teléfono Contacto': docente.telefono_contacto,
        'Correo Contacto': docente.correo_contacto,
        'Cargo Ingreso': docente.cargo_ingreso,
        'Sede Ingreso': docente.sede_ingreso,
        'Facultad': docente.facultad,
        'Carrera / Departamento': docente.carrera_departamento,
        'Jefe Inmediato': docente.jefe_inmediato,
        'Fecha Incorporación': docente.fecha_incorporacion ? new Date(docente.fecha_incorporacion).toLocaleDateString('es-PE') : '',
        'Periodo 2024-1': docente.periodo_2024_1,
        'Periodo 2024-2': docente.periodo_2024_2,
        'Periodo 2025-1': docente.periodo_2025_1,
        'Grupo Modalidad Inducción': docente.grupo_modalidad_induccion,
        'Criterio Inducción 25-2': docente.criterio_induccion_25_2,
        'Fecha Creación': docente.createdAt ? new Date(docente.createdAt).toLocaleString('es-PE') : '',
        'Última Actualización': docente.updatedAt ? new Date(docente.updatedAt).toLocaleString('es-PE') : '',
      }));
    }
    
    // Estadísticas del export
    const stats = {
      totalRegistros: docentes.length,
      docentesUnicos: [...new Set(docentes.map(d => d.dni).filter(Boolean))].length,
      sedesUnicas: [...new Set(docentes.map(d => d.sede_ingreso).filter(Boolean))].length,
      facultadesUnicas: [...new Set(docentes.map(d => d.facultad).filter(Boolean))].length,
      semestres: [...new Set(docentes.map(d => d.semestre).filter(Boolean))],
      fechaUltimaCarga: docentes[0]?.fechaCarga || null,
    };
    
    console.log(`✅ Export de inducción preparado: ${datosExport.length} registros`);
    
    res.json({
      success: true,
      mensaje: `Datos de inducción preparados para exportación a Excel`,
      datos: datosExport,
      estadisticas: stats,
      metadatos: {
        fechaExport: new Date().toISOString(),
        formatoSolicitado: formato,
        filtrosAplicados: query,
        camposIncluidos: Object.keys(datosExport[0] || {}).length
      }
    });
    
  } catch (err) {
    console.error('💥 Error en exportación de datos de inducción:', err);
    res.status(500).json({ 
      success: false,
      message: 'Error al preparar datos de inducción para exportación', 
      error: err.message 
    });
  }
});

// ✅ GET: Reporte de cargas por semestre y fecha
router.get('/reporte', async (req, res) => {
  try {
    const reporte = await InduccionDocente.aggregate([
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
          semestre: -1,
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

// ✅ GET: Obtener docentes con filtros y paginación
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      dni,
      semestre,
      facultad,
      sede_ingreso,
      nombre // Para buscar por nombre o apellido
    } = req.query;

    const query = {};

    if (dni) query.dni = new RegExp(dni, 'i');
    if (semestre) query.semestre = semestre;
    if (facultad) query.facultad = new RegExp(facultad, 'i');
    if (sede_ingreso) query.sede_ingreso = new RegExp(sede_ingreso, 'i');
    if (nombre) {
        query.$or = [
            { primer_nombre: new RegExp(nombre, 'i') },
            { segundo_nombre: new RegExp(nombre, 'i') },
            { apellido_paterno: new RegExp(nombre, 'i') },
            { apellido_materno: new RegExp(nombre, 'i') }
        ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [docentes, total] = await Promise.all([
      InduccionDocente.find(query)
        .sort({ apellido_paterno: 1, apellido_materno: 1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      InduccionDocente.countDocuments(query)
    ]);

    res.json({
      data: docentes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalDocs: total,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      },
      fechaUltimaCarga: docentes[0]?.fechaCarga || null
    });

  } catch (err) {
    console.error("Error al obtener los docentes:", err);
    res.status(500).json({
      message: "Error al obtener los docentes",
      error: err.message
    });
  }
});

// ✅ GET: Registros de un docente específico por DNI
router.get('/docente/:dni', async (req, res) => {
  try {
    const { dni } = req.params;

    const registros = await InduccionDocente.find({ dni })
      .sort({ fechaCarga: -1 })
      .lean();

    if (registros.length === 0) {
      return res.status(404).json({
        message: `No se encontraron registros para el docente con DNI ${dni}`
      });
    }

    res.json({
      dni: dni,
      nombre: `${registros[0].primer_nombre} ${registros[0].apellido_paterno}`,
      semestre: registros[0].semestre,
      totalRegistros: registros.length,
      registros: registros,
      fechaUltimaCarga: registros[0].fechaCarga
    });

  } catch (err) {
    console.error('Error al obtener registros del docente:', err);
    res.status(500).json({
      message: 'Error al obtener registros del docente',
      error: err.message
    });
  }
});

// ✅ POST: Carga masiva UNIFICADA - LIMPIA y REEMPLAZA totalmente
router.post('/bulk', async (req, res) => {
  let registrosNuevos;
  let fechaCarga;

  // Detección automática del formato de entrada
  if (req.body.fechaCarga && req.body.datos) {
    fechaCarga = req.body.fechaCarga;
    registrosNuevos = req.body.datos;
    console.log('📦 Formato detectado: Estructura con fechaCarga separada');
  } else if (Array.isArray(req.body) && req.body.length > 0) {
    registrosNuevos = req.body;
    fechaCarga = registrosNuevos[0]?.fechaCarga || new Date().toISOString().split('T')[0];
    console.log('📦 Formato detectado: Array directo');
  } else {
    return res.status(400).json({
      message: "Formato inválido. Usa: { fechaCarga: 'YYYY-MM-DD', datos: [...] } o un array de objetos."
    });
  }

  // Validaciones
  if (!fechaCarga || !/^\d{4}-\d{2}-\d{2}$/.test(fechaCarga)) {
    return res.status(400).json({ message: "El campo 'fechaCarga' es requerido con formato YYYY-MM-DD." });
  }
  if (!Array.isArray(registrosNuevos) || registrosNuevos.length === 0) {
    return res.status(400).json({ message: "Los registros deben ser un array no vacío." });
  }
  const semestre = registrosNuevos[0]?.semestre;
  if (!semestre) {
    return res.status(400).json({ message: "Todos los registros deben tener el campo 'semestre'." });
  }

  console.log(`📅 Reemplazando COMPLETAMENTE registros del semestre ${semestre} con fecha ${fechaCarga}: ${registrosNuevos.length} registros`);

  try {
    // 1. ELIMINAR todos los registros anteriores del mismo semestre
    console.log(`🗑️ Eliminando registros anteriores del semestre ${semestre}...`);
    const deleteResult = await InduccionDocente.deleteMany({ semestre });
    console.log(`✅ Eliminados: ${deleteResult.deletedCount} registros antiguos`);

    // 2. INSERTAR todos los nuevos registros
    console.log(`➕ Insertando nuevos registros con fecha: ${fechaCarga}...`);
    const registrosConFecha = registrosNuevos.map(reg => ({
      ...reg,
      fechaCarga: fechaCarga
    }));

    const insertResult = await InduccionDocente.insertMany(registrosConFecha, { ordered: false });
    
    console.log(`🎉 REEMPLAZO COMPLETO: ${insertResult.length} registros insertados.`);

    res.status(201).json({
      message: `Registros del semestre ${semestre} REEMPLAZADOS COMPLETAMENTE con fecha ${fechaCarga}`,
      fechaCarga: fechaCarga,
      semestre: semestre,
      operacion: 'REEMPLAZO_COMPLETO',
      registrosProcesados: registrosNuevos.length,
      registrosInsertados: insertResult.length,
      registrosEliminados: deleteResult.deletedCount,
      estado: 'EXITOSA'
    });

  } catch (err) {
    console.error(`💥 Error en reemplazo completo de registros ${fechaCarga}:`, err);
    
    // Manejo de errores de inserción parcial si `ordered: false` se usa con lotes
    if (err.writeErrors) {
        const totalInsertados = err.result?.nInserted || 0;
        const totalFallidos = registrosNuevos.length - totalInsertados;
        return res.status(207).json({
            message: 'Reemplazo PARCIALMENTE exitoso.',
            estado: 'PARCIAL',
            registrosInsertados: totalInsertados,
            registrosFallidos: totalFallidos,
            erroresMuestra: err.writeErrors.slice(0, 5).map(e => e.errmsg)
        });
    }

    res.status(500).json({
      message: 'Error crítico durante el reemplazo completo',
      fechaCarga: fechaCarga,
      semestre: semestre,
      error: err.message,
      estado: 'FALLIDA'
    });
  }
});

// ✅ DELETE: Eliminar por semestre y fecha de carga
router.delete('/bulk', async (req, res) => {
  const { semestre, fechaCarga } = req.body;

  if (!semestre || !fechaCarga) {
    return res.status(400).json({
      message: 'Los campos "semestre" y "fechaCarga" son requeridos.'
    });
  }

  try {
    const filter = { semestre, fechaCarga };
    const result = await InduccionDocente.deleteMany(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: `No se encontraron registros para eliminar con semestre: ${semestre} y fecha: ${fechaCarga}`,
        deletedCount: 0
      });
    }

    res.status(200).json({
      message: `Se eliminaron ${result.deletedCount} registros del semestre ${semestre} con fecha de carga ${fechaCarga}`,
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

// Middleware para obtener un docente por ID para operaciones individuales
async function getDocente(req, res, next) {
  let docente;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID de registro no válido' });
    }
    docente = await InduccionDocente.findById(req.params.id);
    if (docente == null) {
      return res.status(404).json({ message: 'No se pudo encontrar el registro' });
    }
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
  res.docente = docente;
  next();
}

// ✅ GET: Un registro de docente por ID
router.get('/:id', getDocente, (req, res) => {
  res.json(res.docente);
});

// ✅ POST: Crear un nuevo registro de docente individual
router.post('/', async (req, res) => {
  const docente = new InduccionDocente(req.body);
  try {
    const nuevoDocente = await docente.save();
    res.status(201).json(nuevoDocente);
  } catch (err) {
    res.status(400).json({ message: "Error al crear el registro: " + err.message });
  }
});

// ✅ PUT: Actualizar un registro de docente individual
router.put('/:id', getDocente, async (req, res) => {
  Object.assign(res.docente, req.body);
  try {
    const docenteActualizado = await res.docente.save();
    res.json(docenteActualizado);
  } catch (err) {
    res.status(400).json({ message: "Error al actualizar el registro: " + err.message });
  }
});

// ✅ DELETE: Eliminar un registro de docente individual
router.delete('/:id', getDocente, async (req, res) => {
  try {
    await res.docente.deleteOne();
    res.json({ message: 'Registro de docente eliminado exitosamente' });
  } catch (err) {
    res.status(500).json({ message: "Error al eliminar el registro: " + err.message });
  }
});

module.exports = router;
