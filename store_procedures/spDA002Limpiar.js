/**
 * @typedef {object} Horario
 * @property {string} fechaInicio
 * @property {string} fechaFin
 * @property {string} dia
 * @property {string} hora
 * @property {string} turno
 * @property {string} edificio
 * @property {string} campus
 * @property {string} aula
 * @property {string} [estadoHistorico] - 'NUEVO'
 */

/**
 * @typedef {object} Curso
 * @property {string} nombreCurso
 * @property {string} codCurso
 * @property {string} seccion
 * @property {string} periodo
 * @property {string} nrc
 * @property {string} metEdu
 * @property {Horario[]} horarios
 * @property {string} [estadoHistorico] - 'NUEVO' or 'MODIFICADO'
 */

/**
 * @typedef {object} DocenteProcesado
 * @property {string} idDocente
 * @property {string} docente
 * @property {string} RolColaborador
 * @property {string} programa - The program of the selected profile
 * @property {string} modalidad - The modality of the selected profile
 * @property {Curso[]} cursos
 * @property {number|null} promedioEsa
 * @property {object|null} pidd
 * @property {string} [estadoHistorico] - 'NUEVO' or 'MODIFICADO'
 */

const mongoose = require('mongoose'); // Assuming mongoose is used for the DB connection
const { EJSON } = require('bson'); // BSON library for a more robust JSON conversion

/**
 * Helper function to determine the most recent 'fechaCarga' from a collection.
 * @param {Db} db The MongoDB database instance.
 * @param {string} collectionName The name of the collection to query.
 * @returns {Promise<string|null>} The most recent date string (YYYY-MM-DD) or null if not found.
 */
async function getLatestDate(db, collectionName) {
  try {
    const latestDoc = await db.collection(collectionName)
      .find({ fechaCarga: { $exists: true, $ne: null } })
      .sort({ fechaCarga: -1 })
      .limit(1)
      .project({ fechaCarga: 1, _id: 0 })
      .toArray();

    if (latestDoc.length > 0) {
      console.log(`Fecha de carga más reciente para '${collectionName}': ${latestDoc[0].fechaCarga}`);
      return latestDoc[0].fechaCarga;
    } else {
      console.warn(`No se encontró 'fechaCarga' en la colección '${collectionName}'.`);
      return null;
    }
  } catch (error) {
    console.error(`Error al obtener la fecha más reciente para ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Recursively removes all 'estadoHistorico' keys from an object and its children
 * to ensure a fair comparison between old and new data.
 * @param {object} obj The object to clean.
 */
function limpiarEstadoHistorico(obj) {
    if (obj === null || typeof obj !== 'object') return;
    
    delete obj.estadoHistorico;

    for (const key in obj) {
        if (Array.isArray(obj[key])) {
            obj[key].forEach(item => limpiarEstadoHistorico(item));
        } else if (typeof obj[key] === 'object') {
            limpiarEstadoHistorico(obj[key]);
        }
    }
}


/**
 * Analyzes differences between old and new assignments, annotates the new assignments with a change status,
 * and generates a detailed log of changes to be stored separately.
 * @param {Db} db - The MongoDB database instance.
 * @param {string} semestre - The semester being processed.
 * @param {Map<string, DocenteProcesado>} nuevosResultadosMap - Map of new assignments.
 * @param {Map<string, DocenteProcesado>} asignacionesAnterioresMap - Map of previous assignments.
 * @returns {Promise<void>}
 */
async function analizarYRegistrarCambios(db, semestre, nuevosResultadosMap, asignacionesAnterioresMap) {
    console.log('\n--- ANALIZANDO Y REGISTRANDO CAMBIOS ---');
    const cambiosCollection = db.collection('asignacion_cambios');
    const documentosDeCambio = [];
    const fechaDeteccion = new Date();

    // Process new and modified teachers
    for (const [idDocente, nuevoDoc] of nuevosResultadosMap.entries()) {
        const docAnterior = asignacionesAnterioresMap.get(idDocente);
        
        if (!docAnterior) {
            // --- Layer 1: NEW TEACHER ---
            console.log(`[NUEVO] Docente: ${idDocente} (${nuevoDoc.docente})`);
            nuevoDoc.estadoHistorico = 'NUEVO';
            if (nuevoDoc.cursos) {
                nuevoDoc.cursos.forEach(c => {
                    c.estadoHistorico = 'NUEVO';
                    if (c.horarios) c.horarios.forEach(h => h.estadoHistorico = 'NUEVO');
                });
            }
            documentosDeCambio.push({
                semestre, idDocente, docente: nuevoDoc.docente, fechaDeteccion,
                tipoCambio: 'NUEVO', asignacionNueva: nuevoDoc
            });
        } else {
            // --- EXISTING TEACHER: CHECK FOR MODIFICATIONS ---
            limpiarEstadoHistorico(docAnterior);
            const detallesCambio = {};
            let isDocenteModificado = false;

            // Layer 2: Top-level fields
            if (docAnterior.RolColaborador !== nuevoDoc.RolColaborador) {
                isDocenteModificado = true;
                detallesCambio.RolColaborador = { anterior: docAnterior.RolColaborador || null, nuevo: nuevoDoc.RolColaborador || null };
            }
            if ((docAnterior.promedioEsa ?? null) !== (nuevoDoc.promedioEsa ?? null)) {
                isDocenteModificado = true;
                detallesCambio.promedioEsa = { anterior: docAnterior.promedioEsa ?? null, nuevo: nuevoDoc.promedioEsa ?? null };
            }

            // Layer 3 & 4: Compare the entire courses array for any change
            const cursosAnterioresLimpio = (docAnterior.cursos || []).map(c => { const cl = {...c}; limpiarEstadoHistorico(cl); return cl; });
            const cursosNuevosLimpio = (nuevoDoc.cursos || []).map(c => { const cl = {...c}; limpiarEstadoHistorico(cl); return cl; });
            
            if (EJSON.stringify(cursosAnterioresLimpio) !== EJSON.stringify(cursosNuevosLimpio)) {
                 isDocenteModificado = true;
                 const cursosAnterioresMap = new Map((docAnterior.cursos || []).map(c => [c.seccion, c]));
                 const cursosNuevosMap = new Map((nuevoDoc.cursos || []).map(c => [c.seccion, c]));
                 detallesCambio.cursos = "Se detectaron cambios en la lista de cursos o su contenido (horarios, etc.)";

                 // Annotate status at course and horario level
                 for (const [seccion, cursoNuevo] of cursosNuevosMap.entries()) {
                     const cursoAnterior = cursosAnterioresMap.get(seccion);
                     if (!cursoAnterior) {
                         cursoNuevo.estadoHistorico = 'NUEVO';
                         if (cursoNuevo.horarios) cursoNuevo.horarios.forEach(h => h.estadoHistorico = 'NUEVO');
                     } else {
                         // Clean sub-documents before comparison
                         const cursoAnteriorLimpio = {...cursoAnterior};
                         limpiarEstadoHistorico(cursoAnteriorLimpio);
                         const cursoNuevoLimpio = {...cursoNuevo};
                         limpiarEstadoHistorico(cursoNuevoLimpio);

                         if (EJSON.stringify(cursoAnteriorLimpio) !== EJSON.stringify(cursoNuevoLimpio)) {
                             cursoNuevo.estadoHistorico = 'MODIFICADO';
                             const horariosAnterioresKeys = new Set((cursoAnterior.horarios || []).map(h => EJSON.stringify(h)));
                             (cursoNuevo.horarios || []).forEach(h => {
                                 if (!horariosAnterioresKeys.has(EJSON.stringify(h))) {
                                     h.estadoHistorico = 'NUEVO';
                                 }
                             });
                         }
                     }
                 }
            }

            // Layer 5: PIDD changes
            if (EJSON.stringify(docAnterior.pidd) !== EJSON.stringify(nuevoDoc.pidd)){
                 isDocenteModificado = true;
                 detallesCambio.pidd = { anterior: docAnterior.pidd || null, nuevo: nuevoDoc.pidd || null };
            }

            if (isDocenteModificado) {
                nuevoDoc.estadoHistorico = 'MODIFICADO';
                documentosDeCambio.push({
                    semestre, idDocente, docente: nuevoDoc.docente, fechaDeteccion,
                    tipoCambio: 'MODIFICADO', cambios: detallesCambio
                });
            }
        }
    }

    // Process removed teachers
    for (const [idDocente, docAnterior] of asignacionesAnterioresMap.entries()) {
        if (!nuevosResultadosMap.has(idDocente)) {
            console.log(`[ELIMINADO] Docente: ${idDocente} (${docAnterior.docente})`);
            documentosDeCambio.push({
                semestre, idDocente, docente: docAnterior.docente, fechaDeteccion,
                tipoCambio: 'ELIMINADO', asignacionAnterior: docAnterior
            });
        }
    }

    if (documentosDeCambio.length > 0) {
        console.log(`Se detectaron ${documentosDeCambio.length} cambios.`);
        await cambiosCollection.deleteMany({ semestre: semestre });
        await cambiosCollection.insertMany(documentosDeCambio);
        console.log(`Se guardaron ${documentosDeCambio.length} documentos en 'asignacion_cambios'.`);
    } else {
        console.log('No se detectaron cambios para guardar en log.');
    }
    console.log('--- FIN DEL ANÁLISIS Y REGISTRO DE CAMBIOS ---\n');
}

/**
 * Processes teacher schedules, surveys, and development plans to create a unified assignment document.
 * @param {string} semestre The academic semester to tag the final documents with (e.g., "2025-1").
 * @returns {Promise<DocenteProcesado[]>} The final array of processed teacher data.
 */
async function spDA002Limpiar(semestre) {
  if (!semestre || !/^\d{4}-\d$/.test(semestre)) {
    throw new Error('El parámetro semestre es requerido y debe tener el formato "YYYY-N" (e.g., "2025-1").');
  }

  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('No se pudo obtener la instancia de la base de datos desde Mongoose.');
    }
    console.log(`Iniciando procesamiento de asignaciones. Semestre para etiquetado final: ${semestre}`);

    // --- 0. Get latest data load dates ---
    const [
      latestEncuestaDate,
      latestProgramacionDate,
      latestReporteDate,
      latestPlanDate
    ] = await Promise.all([
      getLatestDate(db, 'encuestaesas'),
      getLatestDate(db, 'programacionhorarias'),
      getLatestDate(db, 'reporteunicodocentes'),
      getLatestDate(db, 'planintegraldocentes')
    ]);

    // --- 1. Fetch and Pre-process Data ---
    const [programacionCompleta, encuestasCompletas, reportesCompletos, piddCompletos, periodos] = await Promise.all([
        db.collection('programacionhorarias').find({ fechaCarga: latestProgramacionDate, idPrinc: 'Y' }).toArray(),
        db.collection('encuestaesas').find({ fechaCarga: latestEncuestaDate }).toArray(),
        db.collection('reporteunicodocentes').find({ fechaCarga: latestReporteDate }).toArray(),
        db.collection('planintegraldocentes').find({ fechaCarga: latestPlanDate }).toArray(),
        db.collection('periodos').find({}).toArray()
    ]);
    
    // --- 2. Create Lookup Maps ---
    const reporteMap = new Map(reportesCompletos.map(r => [r.codigoBanner.toUpperCase(), r]));
    const piddMap = new Map(piddCompletos.map(p => [p.banner.toUpperCase(), p]));
    const periodoMap = new Map(periodos.map(p => [p.periodo, p.programa]));

    const programacionPorDocenteMap = new Map();
    for (const prog of programacionCompleta) {
        const idDocente = prog.idDocente.toUpperCase();
        if (!programacionPorDocenteMap.has(idDocente)) {
            programacionPorDocenteMap.set(idDocente, []);
        }
        const programa = periodoMap.get(prog.periodo) || 'N/A';
        const modalidad_temp = { 'P': 'Presencial', 'R': 'Virtual Síncrono', 'V': 'Virtual Asíncrono', 'H': 'Híbrido' }[prog.metEdu] || 'Sin Definir';
        const modalidad = ['TALLER DE TESIS 1', 'TALLER DE TESIS 2', 'TESIS', 'TRABAJO DE INVESTIGACIÓN'].includes(prog.nombreCurso) ? 'Tesis' : modalidad_temp;
        
        programacionPorDocenteMap.get(idDocente).push({ ...prog, derived_programa: programa, derived_modalidad: modalidad });
    }

    const esaOrdenadaPorDocenteMap = new Map();
    for (const encuesta of encuestasCompletas) {
        const codBanner = encuesta.codBanner.toUpperCase();
        if (!esaOrdenadaPorDocenteMap.has(codBanner)) esaOrdenadaPorDocenteMap.set(codBanner, []);
        esaOrdenadaPorDocenteMap.get(codBanner).push(encuesta);
    }
    esaOrdenadaPorDocenteMap.forEach(encuestas => encuestas.sort((a, b) => (a.promedioEsa ?? Infinity) - (b.promedioEsa ?? Infinity)));

    // --- 3. CORE LOGIC: Build teacher profiles based on survey priority ---
    const resultadoFinal = [];
    for (const [idDocente, encuestasOrdenadas] of esaOrdenadaPorDocenteMap.entries()) {
        const cursosDelDocente = programacionPorDocenteMap.get(idDocente);
        if (!cursosDelDocente) continue;

        let perfilEncontrado = false;
        for (const encuestaPrioritaria of encuestasOrdenadas) {
            const programaTarget = encuestaPrioritaria.programa;
            const modalidadTarget = encuestaPrioritaria.modalidad;

            const cursosQueCoinciden = cursosDelDocente.filter(curso =>
                curso.derived_programa === programaTarget && curso.derived_modalidad === modalidadTarget
            );

            if (cursosQueCoinciden.length > 0) {
                const reporteDocente = reporteMap.get(idDocente);
                if (!reporteDocente || ['AYUDANTE DE CATEDRA', 'JEFE DE PRACTICAS', 'JEFE DE PRACTICAS SALUD', 'TUTOR DE INTERNADO', null].includes(reporteDocente.rol2025_1)) {
                    break;
                }

                const cursosAgrupadosMap = new Map();
                for (const curso of cursosQueCoinciden) {
                    if (!cursosAgrupadosMap.has(curso.seccion)) {
                        cursosAgrupadosMap.set(curso.seccion, {
                            nombreCurso: curso.nombreCurso, codCurso: curso.codCurso, seccion: curso.seccion,
                            periodo: curso.periodo, nrc: curso.nrc, metEdu: curso.metEdu, horarios: [],
                        });
                    }
                    cursosAgrupadosMap.get(curso.seccion).horarios.push({
                        fechaInicio: curso.fechaInicio, fechaFin: curso.fechaFin, dia: curso.dia,
                        hora: curso.hora, turno: curso.turno, edificio: curso.edificio,
                        campus: curso.campus, aula: curso.aula
                    });
                }

                const docenteFinal = {
                    idDocente,
                    docente: cursosQueCoinciden[0].docente,
                    RolColaborador: reporteDocente.rol2025_1,
                    programa: programaTarget,
                    modalidad: modalidadTarget,
                    promedioEsa: encuestaPrioritaria.promedioEsa,
                    cursos: Array.from(cursosAgrupadosMap.values()),
                    pidd: piddMap.get(idDocente) || null,
                };
                resultadoFinal.push(docenteFinal);
                perfilEncontrado = true;
                break; 
            }
        }
    }
    console.log(`Procesamiento completado. Total de perfiles de docentes únicos generados: ${resultadoFinal.length}`);
    
    // --- 4. Compare with previous data, annotate, and log changes ---
    const asignacionesCollection = db.collection('asignaciones');
    const ultimaEjecucion = await asignacionesCollection.find({ semestre: semestre }).sort({ fechaHoraEjecucion: -1 }).limit(1).toArray();
    let asignacionesAnteriores = [];
    if (ultimaEjecucion.length > 0) {
        console.log(`Comparando contra la ejecución de: ${ultimaEjecucion[0].fechaHoraEjecucion}`);
        asignacionesAnteriores = await asignacionesCollection.find({ semestre: semestre, fechaHoraEjecucion: ultimaEjecucion[0].fechaHoraEjecucion }).toArray();
    } else {
        console.log('No se encontró una ejecución anterior para este semestre.');
    }

    const nuevosResultadosMap = new Map(resultadoFinal.map(doc => [doc.idDocente, EJSON.parse(EJSON.stringify(doc))]));
    const asignacionesAnterioresMap = new Map(asignacionesAnteriores.map(doc => [doc.idDocente, doc]));

    await analizarYRegistrarCambios(db, semestre, nuevosResultadosMap, asignacionesAnterioresMap);
    
    // --- 5. Save the annotated results to 'asignaciones' collection
    const resultadosAnotados = Array.from(nuevosResultadosMap.values());
    if (resultadosAnotados.length > 0) {
      const fechaHoraEjecucion = new Date();
      const documentosAGuardar = resultadosAnotados.map(doc => ({ ...doc, semestre, fechaHoraEjecucion }));
      await asignacionesCollection.insertMany(documentosAGuardar);
      console.log(`${documentosAGuardar.length} documentos para el semestre ${semestre} guardados en 'asignaciones' como nuevo registro histórico.`);
    } else {
      console.log(`No se generaron nuevos documentos para esta ejecución.`);
    }

    return resultadosAnotados;

  } catch (error) {
    console.error(`Error en la ejecución de spDA002Limpiar para el semestre ${semestre}:`, error);
    throw error;
  }
}

module.exports = { spDA002Limpiar };
