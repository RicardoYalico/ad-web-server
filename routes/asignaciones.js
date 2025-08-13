const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Asignaciones = require('../models/Asignaciones'); // Asegúrate de que el modelo esté correctamente importado

// GET: Listar con filtros y paginación
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 5000, latest = 'false' } = req.query;
    const query = {};

    // Construcción de la consulta basada en los parámetros del query string
    if (req.query.periodo) query.periodo = req.query.periodo;
    if (req.query.nombreCurso) query.nombreCurso = req.query.nombreCurso;
    if (req.query.idDocente) query.idDocente = req.query.idDocente;
    if (req.query.docente) query.docente = req.query.docente;
    if (req.query.rolColaborador) query.rolColaborador = req.query.rolColaborador;
    if (req.query.programa) query.programa = req.query.programa;
    if (req.query.modalidad) query.modalidad = req.query.modalidad;

    // Selección de campos específicos si se solicita
    const selectFields = req.query.fields ? req.query.fields.split(',').join(' ') : '';

    const opciones = {
      page: parseInt(page),
      limit: parseInt(limit),
      lean: true
    };

    let registros = [];
    let totalDocs = 0;

    if (latest === 'true') {
      // Obtener la fecha más reciente considerando también los filtros
      const docMasReciente = await Asignaciones.findOne(query)
        .sort({ fechaHoraEjecucion: -1 })
        .lean();

      if (docMasReciente) {
        const ultimaFecha = docMasReciente.fechaHoraEjecucion;

        // Buscar registros con esa misma fecha y filtros
        const latestQuery = { ...query, fechaHoraEjecucion: ultimaFecha };

        totalDocs = await Asignaciones.countDocuments(latestQuery);

        registros = await Asignaciones.find(latestQuery)
          .select(selectFields)
          .sort({ fechaHoraEjecucion: -1 })
          .limit(opciones.limit)
          .skip((opciones.page - 1) * opciones.limit)
          .lean();
      }
    } else {
      // Paginación normal
      totalDocs = await Asignaciones.countDocuments(query);

      registros = await Asignaciones.find(query)
        .select(selectFields)
        .sort({ fechaHoraEjecucion: -1 })
        .limit(opciones.limit)
        .skip((opciones.page - 1) * opciones.limit)
        .lean();
    }

    // Armar respuesta unificada
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


// NUEVO ENDPOINT DE REPORTE
// GET: Generar un reporte agrupado por semestre y fecha de carga
router.get('/reporte', async (req, res) => {
  try {
    const reporte = await Asignaciones.aggregate([
      {
        // Etapa 1: Agrupar por semestre y la fecha extraída de fechaHoraEjecucion
        $group: {
          _id: {
            semestre: "$semestre",
            // Extrae solo la parte de la fecha (YYYY-MM-DD) de fechaHoraEjecucion
            fechaCarga: { $dateToString: { format: "%Y-%m-%d", date: "$fechaHoraEjecucion" } }
          },
          // Contar la cantidad de documentos en cada grupo
          cantidad: { $sum: 1 },
          // Tomar la fecha y hora completa del primer documento en el grupo como referencia
          ejecucionCompleta: { $first: "$fechaHoraEjecucion" }
        }
      },
      {
        // Etapa 2: Reestructurar el formato de salida para que sea más claro
        $project: {
          _id: 0,
          semestre: "$_id.semestre",
          fechaCarga: "$_id.fechaCarga",
          cantidad: "$cantidad",
           // Extrae solo la parte de la hora (HH:MM:SS) de la fecha guardada
          horaEjecucion: { $dateToString: { format: "%H:%M:%S", date: "$ejecucionCompleta" } }
        }
      },
      {
        // Etapa 3: Ordenar los resultados
        $sort: {
          semestre: 1, // Orden ascendente por semestre
          fechaCarga: 1  // Luego por fecha de carga
        }
      }
    ]);

    res.json(reporte);
  } catch (err) {
    console.error('Error al generar el reporte:', err);
    res.status(500).json({ message: 'Error al generar el reporte', error: err.message });
  }
});


// ENDPOINT MODIFICADO
// GET: Obtener todos los registros con la fechaHoraEjecucion más reciente
router.get('/latest', async (req, res) => {
    try {
        // Paso 1: Encontrar el documento más reciente para obtener la última fecha de ejecución.
        const docMasReciente = await Asignaciones.findOne({})
            .sort({ fechaHoraEjecucion: -1 })
            .lean();

        // Si no hay ningún registro en la base de datos, retornar el formato vacío.
        if (!docMasReciente) {
            return res.json({
                data: [],
                totalPages: 0,
                currentPage: 1,
                totalDocs: 0,
                limit: 0
            });
        }

        // Extraer la fecha más reciente.
        const ultimaFecha = docMasReciente.fechaHoraEjecucion;

        // Paso 2: Buscar todos los registros que tengan exactamente esa fecha.
        const registrosConUltimaFecha = await Asignaciones.find({ 
            fechaHoraEjecucion: ultimaFecha 
        }).lean();
        
        const totalDocs = registrosConUltimaFecha.length;

        // Devolver la respuesta con el formato de paginación solicitado.
        res.json({
            data: registrosConUltimaFecha,
            totalPages: 1, // Siempre será una página ya que traemos todos los de la última fecha
            currentPage: 1, // Siempre será la primera página
            totalDocs: totalDocs,
            limit: totalDocs // El límite es el total de documentos encontrados
        });

    } catch (err) {
        console.error("Error al obtener los últimos registros por fecha:", err);
        res.status(500).json({ message: "Error interno del servidor: " + err.message });
    }
});


// GET: Obtener por ID
// Este endpoint debe ir DESPUÉS del endpoint '/latest' y '/reporte' para evitar conflictos de rutas.
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
    // Usamos insertMany para una inserción masiva eficiente
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
  // Object.assign actualiza los campos del documento encontrado con los del body
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
    // Usamos deleteOne() en lugar del obsoleto remove()
    await res.registro.deleteOne();
    res.json({ message: 'Registro eliminado' });
  } catch (err) {
    console.error("Error al eliminar:", err);
    res.status(500).json({ message: "Error al eliminar: " + err.message });
  }
});

// Middleware para obtener registro por ID y adjuntarlo a la solicitud
async function getRegistro(req, res, next) {
  let registro;
  try {
    // Validar si el ID proporcionado es un ObjectId válido de MongoDB
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
  res.registro = registro; // Adjuntamos el registro encontrado al objeto de respuesta
  next(); // Pasamos al siguiente middleware o a la función de la ruta
}

module.exports = router;
