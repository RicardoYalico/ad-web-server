// store_procedures/spDA002Limpiar.js
const mongoose = require('mongoose');

async function spDA002Limpiar(limit = 10000, skip = 0) { // El limit/skip SÍ se usa para paginar la lista final
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('No se pudo obtener la instancia de la base de datos desde Mongoose. Asegúrate de que Mongoose esté conectado.');
    }
    const collection = db.collection('programacionhorarias');

const agg = [
  // ===================================================================
  // ETAPA 1: OBTENER Y PREPARAR DATOS INICIALES (SIN CAMBIOS)
  // ===================================================================
  { $match: { idPrinc: 'Y' } },
  {
    $lookup: {
      from: 'reportesUnicosDocentes',
      localField: 'idDocente',
      foreignField: 'codigoBanner',
      as: 'infoReporteDocenteArr'
    }
  },
  {
    $addFields: {
      RolColaborador: { $arrayElemAt: ['$infoReporteDocenteArr.rol2025_1', 0] }
    }
  },
  {
    $match: {
      RolColaborador: {
        $nin: [
          'AYUDANTE DE CATEDRA', 'JEFE DE PRACTICAS',
          'JEFE DE PRACTICAS SALUD', 'TUTOR DE INTERNADO', null
        ]
      }
    }
  },
  {
    $lookup: {
      from: 'periodos',
      localField: 'periodo',
      foreignField: 'periodo',
      as: 'infoPeriodoArr'
    }
  },
  {
    $addFields: {
      programa: { $arrayElemAt: ['$infoPeriodoArr.programa', 0] }
    }
  },
  {
    $addFields: {
      modalidad_temp: {
        $switch: {
          branches: [
            { case: { $eq: ['$metEdu', 'P'] }, then: 'Presencial' },
            { case: { $eq: ['$metEdu', 'R'] }, then: 'Virtual síncrono' },
            { case: { $eq: ['$metEdu', 'V'] }, then: 'Virtual asíncrono' },
            { case: { $eq: ['$metEdu', 'H'] }, then: 'Híbrido' }
          ],
          default: 'Sin Definir'
        }
      }
    }
  },
  {
    $addFields: {
      modalidad: {
        $cond: {
          if: {
            $in: [
              '$nombreCurso',
              ['TALLER DE TESIS 1', 'TALLER DE TESIS 2', 'TESIS', 'TRABAJO DE INVESTIGACIÓN']
            ]
          },
          then: 'Tesis',
          else: '$modalidad_temp'
        }
      }
    }
  },
  {
    $lookup: {
      from: 'supermallas',
      let: { cursoCodigo: '$codCurso' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$codigoOficial', '$$cursoCodigo'] },
                { $eq: ['$ciclo', '1'] }
              ]
            }
          }
        }
      ],
      as: 'infoSupermallaArr'
    }
  },
  {
    $addFields: {
      Ciclo: { $arrayElemAt: ['$infoSupermallaArr.ciclo', 0] }
    }
  },
  {
    $match: { Ciclo: "1" }
  },

  // ===================================================================
  // ETAPA 2: AGRUPAR CURSOS Y HORARIOS (AHORA SE HACE PRIMERO)
  // ===================================================================
  {
    // 2.1. PRIMER GRUPO: Agrupar por curso para empaquetar sus horarios.
    // Nota: Se elimina 'promedioEsa' de la clave porque aún no lo tenemos.
    $group: {
      _id: {
        periodo: "$periodo",
        idDocente: "$idDocente",
        RolColaborador: "$RolColaborador",
        programa: "$programa",
        modalidad: "$modalidad",
        Ciclo: "$Ciclo",
        nombreCurso: "$nombreCurso"
      },
      horarios: {
        $push: {
          fechaInicio: "$fechaInicio",
          fechaFin: "$fechaFin",
          dia: "$dia",
          hora: "$hora",
          turno: "$turno",
          edificio: "$edificio",
          campus: "$campus",
          aula: "$aula"
        }
      }
    }
  },
  {
    // 2.2. SEGUNDO GRUPO: Agrupar los cursos por docente/programa/modalidad.
    $group: {
      _id: {
        periodo: "$_id.periodo",
        idDocente: "$_id.idDocente",
        RolColaborador: "$_id.RolColaborador",
        programa: "$_id.programa",
        modalidad: "$_id.modalidad",
        Ciclo: "$_id.Ciclo"
      },
      cursos: {
        $push: {
          nombreCurso: "$_id.nombreCurso",
          horarios: "$horarios"
        }
      }
    }
  },

  // ===================================================================
  // ETAPA 3: BUSCAR EL PROMEDIO ESA (AHORA SE HACE DESPUÉS DE AGRUPAR)
  // ===================================================================
  {
    $lookup: {
      from: 'encuestaesas',
      let: {
        // Usamos las variables del documento ya agrupado
        docenteIdToCompare: '$_id.idDocente',
        currentPrograma: '$_id.programa',
        currentModalidad: '$_id.modalidad'
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$codBanner', '$$docenteIdToCompare'] },
                { $eq: ['$programa', '$$currentPrograma'] },
                { $eq: ['$modalidad', '$$currentModalidad'] },
                // Filtro adicional importante
                { $eq: ['$tipoDeEncuesta', 'Malla 2025'] }
              ]
            }
          }
        },
        { $match: { promedioEsa: { $type: "number", $ne: null } } },
        { $sort: { promedioEsa: 1 } },
        { $limit: 1 },
        { $project: { _id: 0, promedioEsa: 1 } }
      ],
      as: 'infoEncuestaArr'
    }
  },

  // ===================================================================
  // ETAPA 4: PROYECCIÓN FINAL Y LIMPIEZA
  // ===================================================================
  {
    $project: {
      _id: 0,
      periodo: "$_id.periodo",
      idDocente: "$_id.idDocente",
      RolColaborador: "$_id.RolColaborador",
      programa: "$_id.programa",
      modalidad: "$_id.modalidad",
      Ciclo: "$_id.Ciclo",
      cursos: "$cursos",
      promedioEsa: {
        $let: {
          vars: { esaValue: { $arrayElemAt: ['$infoEncuestaArr.promedioEsa', 0] } },
          in: {
            $cond: {
              if: { $eq: ['$$esaValue', null] },
              then: null, // Usamos null en lugar de "SIN ESA" para el ordenamiento
              else: '$$esaValue'
            }
          }
        }
      }
    }
  },

  // ===================================================================
  // ETAPA 5: SELECCIONAR EL MEJOR REGISTRO POR DOCENTE
  // ===================================================================
  {
    $sort: {
      idDocente: 1,
      promedioEsa: -1 // Invierte el orden de tipos, poniendo números antes que null
    }
  },
  {
    $group: {
      _id: "$idDocente",
      docElegido: { $first: "$$ROOT" }
    }
  },
  {
    $replaceRoot: {
      newRoot: "$docElegido"
    }
  }
];

    const result = await collection.aggregate(agg, { allowDiskUse: true }).toArray();

    const resultCollection = db.collection('asignaciones');
    const fechaHoraEjecucion = new Date();
    const documentosAGuardar = result.map(doc => ({
      ...doc,
      fechaHoraEjecucion: fechaHoraEjecucion
    }));

    if (documentosAGuardar.length > 0) {
      await resultCollection.insertMany(documentosAGuardar);
    }

    return result;

  } catch (error) {
    console.error('Error en spDA002Limpiar:', error);
    throw error;
  }
}

module.exports = spDA002Limpiar;