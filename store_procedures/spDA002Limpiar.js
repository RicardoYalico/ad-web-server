// store_procedures/spDA002Limpiar.js
const mongoose = require('mongoose');

/**
 * Compara dos docentes para decidir cuál tiene la "mejor" ESA.
 * La lógica es:
 * 1. Un ESA numérico siempre es mejor que uno nulo.
 * 2. Entre dos ESAs numéricos, el menor es mejor.
 * @param {object} actual - El docente actual en el mapa.
 * @param {object} nuevo - El nuevo docente que se está considerando.
 * @returns {object} - El docente que se debe conservar.
 */
function obtenerMejorDocente(actual, nuevo) {
  const esaActualEsNumero = typeof actual.promedioEsa === 'number';
  const esaNuevaEsNumero = typeof nuevo.promedioEsa === 'number';

  // Caso 1: El nuevo es número y el actual no. El nuevo es mejor.
  if (esaNuevaEsNumero && !esaActualEsNumero) {
    return nuevo;
  }
  // Caso 2: El actual es número y el nuevo no. El actual se queda.
  if (esaActualEsNumero && !esaNuevaEsNumero) {
    return actual;
  }
  // Caso 3: Ambos son números. El que tenga el menor ESA es mejor.
  if (esaActualEsNumero && esaNuevaEsNumero) {
    return nuevo.promedioEsa < actual.promedioEsa ? nuevo : actual;
  }
  // Caso 4: Ninguno es número (ambos son null). Nos quedamos con el actual, no hay preferencia.
  return actual;
}


async function spDA002Limpiar() {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('No se pudo obtener la instancia de la base de datos desde Mongoose.');
    }

    // --- 1. PREPARAR Y OBTENER LOS DOCENTES CON SUS HORARIOS ---
    const docentesCollection = db.collection('programacionhorarias');
    const aggDocentes = [
      // Etapas 1 a 2 del pipeline anterior, que preparan y agrupan los datos del docente.
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
            $nin: ['AYUDANTE DE CATEDRA', 'JEFE DE PRACTICAS', 'JEFE DE PRACTICAS SALUD', 'TUTOR DE INTERNADO', null]
          }
        }
      },
      {
        $lookup: { from: 'periodos', localField: 'periodo', foreignField: 'periodo', as: 'infoPeriodoArr' }
      },
      {
        $addFields: { programa: { $arrayElemAt: ['$infoPeriodoArr.programa', 0] } }
      },
      {
        $addFields: {
          modalidad_temp: {
            $switch: {
              branches: [
                { case: { $eq: ['$metEdu', 'P'] }, then: 'Presencial' },
                { case: { $eq: ['$metEdu', 'R'] }, then: 'Virtual Síncrono' },
                { case: { $eq: ['$metEdu', 'V'] }, then: 'Virtual Asíncrono' },
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
              if: { $in: ['$nombreCurso', ['TALLER DE TESIS 1', 'TALLER DE TESIS 2', 'TESIS', 'TRABAJO DE INVESTIGACIÓN']] },
              then: 'Tesis',
              else: '$modalidad_temp'
            }
          }
        }
      },
      // {
      //   $lookup: {
      //     from: 'supermallas',
      //     let: { cursoCodigo: '$codCurso' },
      //     pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$codigoOficial', '$$cursoCodigo'] }, { $eq: ['$ciclo', '1'] }] } } }],
      //     as: 'infoSupermallaArr'
      //   }
      // },
      // { $addFields: { Ciclo: { $arrayElemAt: ['$infoSupermallaArr.ciclo', 0] } } },
      // { $match: { Ciclo: "1" } },
      // Agrupaciones
      {
        $group: {
          _id: { periodo: "$periodo", idDocente: "$idDocente", docente: "$docente", RolColaborador: "$RolColaborador", programa: "$programa", modalidad: "$modalidad", nombreCurso: "$nombreCurso", codCurso: "$codCurso", seccion: "$seccion", periodo: "$periodo", nrc: "$nrc", metEdu: "$metEdu"},
          horarios: { $push: { fechaInicio: "$fechaInicio", fechaFin: "$fechaFin", dia: "$dia", hora: "$hora", turno: "$turno", edificio: "$edificio", campus: "$campus", aula: "$aula" } }
        }
      },
      {
        $group: {
          _id: { periodo: "$_id.periodo", idDocente: "$_id.idDocente", docente:"$_id.docente", RolColaborador: "$_id.RolColaborador", programa: "$_id.programa", modalidad: "$_id.modalidad" },
          cursos: { $push: { nombreCurso: "$_id.nombreCurso", codCurso: "$_id.codCurso", seccion: "$_id.seccion", periodo: "$_id.periodo", nrc: "$_id.nrc", metEdu: "$_id.metEdu", horarios: "$horarios" } }
        }
      },
      // Proyección para limpiar la salida y facilitar el manejo en JS
      {
        $project: {
          _id: 0,
          periodo: "$_id.periodo",
          idDocente: "$_id.idDocente",
          docente: "$_id.docente",
          RolColaborador: "$_id.RolColaborador",
          programa: "$_id.programa",
          modalidad: "$_id.modalidad",
          Ciclo: "$_id.Ciclo",
          cursos: "$cursos"
        }
      }
    ];
    const docentesProcesados = await docentesCollection.aggregate(aggDocentes, { allowDiskUse: true }).toArray();

    // --- 2. OBTENER LOS DATOS DE LAS ENCUESTAS ---
    const encuestaCollection = db.collection('encuestaesas');
    const encuestas = await encuestaCollection.find({
      // tipoDeEncuesta: "Malla 2025" // Filtro principal
    }).project({ // Traer solo los campos necesarios
      codBanner: 1,
      programa: 1,
      modalidad: 1,
      promedioEsa: 1,
      _id: 0
    }).toArray();

    // --- 3. CREAR UN MAPA PARA BÚSQUEDA RÁPIDA DE ESA ---
    const encuestaMap = new Map();
    for (const encuesta of encuestas) {
      const key = `${encuesta.codBanner}-${encuesta.programa}-${encuesta.modalidad}`;
      encuestaMap.set(key, encuesta.promedioEsa);
    }
    console.log(`Mapa de encuestas creado con ${encuestaMap.size} entradas.`);

    // --- 4. UNIR LOS DATOS EN JAVASCRIPT ---
    const docentesConEsa = docentesProcesados.map(docente => {
      const key = `${docente.idDocente}-${docente.programa}-${docente.modalidad}`;
      const promedioEsa = encuestaMap.get(key) || null; // Si no se encuentra, es null
      return {
        ...docente,
        promedioEsa: promedioEsa
      };
    });

    // --- 5. SELECCIONAR EL MEJOR REGISTRO POR DOCENTE ---
    const docentesFinalesMap = new Map();
    for (const docente of docentesConEsa) {
      const id = docente.idDocente;
      const docenteExistente = docentesFinalesMap.get(id);

      if (!docenteExistente) {
        docentesFinalesMap.set(id, docente);
      } else {
        const mejorDocente = obtenerMejorDocente(docenteExistente, docente);
        docentesFinalesMap.set(id, mejorDocente);
      }
    }

    const resultadoIntermedio = Array.from(docentesFinalesMap.values());
    
    // --- 6. OBTENER LOS DATOS DEL PLAN INTEGRAL ---
    const planIntegralCollection = db.collection('planintegral');
    const planesIntegrales = await planIntegralCollection.find({}).toArray();

    // --- 7. CREAR UN MAPA PARA BÚSQUEDA RÁPIDA DEL PLAN INTEGRAL (PIDD) ---
    const piddMap = new Map();
    for (const plan of planesIntegrales) {
      // La clave es el 'banner' para hacer match con 'idDocente'
      piddMap.set(plan.banner, plan);
    }
    console.log(`Mapa de Plan Integral creado con ${piddMap.size} entradas.`);

    // --- 8. UNIR LA INFORMACIÓN DEL PLAN INTEGRAL AL RESULTADO ---
    const resultadoFinal = resultadoIntermedio.map(docente => {
      const piddInfo = piddMap.get(docente.idDocente) || null; // Busca por idDocente (que es el banner)
      return {
        ...docente,
        pidd: piddInfo // Añade la nueva columna 'pidd'
      };
    });
    
    console.log(`Procesamiento completado. Total de docentes únicos: ${resultadoFinal.length}`);

    // Opcional: Guardar el resultado en una nueva colección
    const resultCollection = db.collection('asignaciones');
    const fechaHoraEjecucion = new Date();
    const documentosAGuardar = resultadoFinal.map(doc => ({ ...doc, fechaHoraEjecucion }));
    if (documentosAGuardar.length > 0) {
      await resultCollection.deleteMany({}); // Opcional: Limpiar antes de insertar
      await resultCollection.insertMany(documentosAGuardar);
      console.log(`${documentosAGuardar.length} documentos guardados en 'asignaciones'.`);
    }

    return resultadoFinal;

  } catch (error) {
    console.error('Error en spDA002Limpiar:', error);
    throw error;
  }
}

module.exports = spDA002Limpiar;
