/**
 * Este script procesa los datos de origen para generar tres colecciones normalizadas
 * que representan la asignación de docentes.
 * 1. docentes_perfiles: Información principal y única de cada perfil de docente.
 * 2. docentes_cursos: Información de los cursos (secciones) asignados a cada perfil.
 * 3. cursos_horarios: El detalle de los bloques horarios para cada curso.
 */

const mongoose = require('mongoose');

/**
 * Helper para obtener la fecha de carga más reciente de una colección.
 * @param {Db} db Instancia de la base de datos de MongoDB.
 * @param {string} collectionName Nombre de la colección.
 * @returns {Promise<string|null>} La fecha más reciente como string (YYYY-MM-DD) o null.
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
 * Procesa y normaliza las asignaciones de docentes en tres colecciones separadas.
 * @param {string} semestre El semestre académico a procesar (ej. "2025-1").
 * @returns {Promise<object>} Un objeto con los resultados de las tres colecciones.
 */
async function spDA004NormalizarAsignaciones(semestre) {
  if (!semestre || !/^\d{4}-\d$/.test(semestre)) {
    throw new Error('El parámetro semestre es requerido y debe tener el formato "YYYY-N" (e.g., "2025-1").');
  }

  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('No se pudo obtener la instancia de la base de datos desde Mongoose.');
    }
    console.log(`Iniciando normalización de asignaciones. Semestre: ${semestre}`);

    // --- 0. Obtener fechas de carga más recientes ---
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

    // --- 1. Cargar y Pre-procesar Datos ---
    const [programacionCompleta, encuestasCompletas, reportesCompletos, piddCompletos, periodos] = await Promise.all([
        db.collection('programacionhorarias').find({ fechaCarga: latestProgramacionDate, idPrinc: 'Y' }).toArray(),
        db.collection('encuestaesas').find({ fechaCarga: latestEncuestaDate }).toArray(),
        db.collection('reporteunicodocentes').find({ fechaCarga: latestReporteDate }).toArray(),
        db.collection('planintegraldocentes').find({ fechaCarga: latestPlanDate }).toArray(),
        db.collection('periodos').find({}).toArray()
    ]);
    
    // --- 2. Crear Mapas de Búsqueda (Lookups) ---
    const reporteMap = new Map(reportesCompletos.map(r => [r.codigoBanner.toUpperCase(), r]));
    const piddMap = new Map(piddCompletos.map(p => [p.banner.toUpperCase(), p]));
    const periodoMap = new Map(periodos.map(p => [p.periodo, p.programa]));

    // Agrupar programaciones por docente y derivar programa/modalidad
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

    // Agrupar y ordenar encuestas por docente (de menor a mayor promedio ESA)
    const esaOrdenadaPorDocenteMap = new Map();
    for (const encuesta of encuestasCompletas) {
        const codBanner = encuesta.codBanner.toUpperCase();
        if (!esaOrdenadaPorDocenteMap.has(codBanner)) esaOrdenadaPorDocenteMap.set(codBanner, []);
        esaOrdenadaPorDocenteMap.get(codBanner).push(encuesta);
    }
    esaOrdenadaPorDocenteMap.forEach(encuestas => encuestas.sort((a, b) => (a.promedioEsa ?? Infinity) - (b.promedioEsa ?? Infinity)));

    // --- 3. LÓGICA CENTRAL MEJORADA: Un perfil por docente ---
    const perfilesParaGuardar = [];
    const cursosParaGuardar = [];
    const horariosParaGuardar = [];

    for (const [idDocente, encuestasOrdenadas] of esaOrdenadaPorDocenteMap.entries()) {
        const cursosDelDocente = programacionPorDocenteMap.get(idDocente);
        if (!cursosDelDocente) continue;

        const reporteDocente = reporteMap.get(idDocente);
        if (!reporteDocente || ['AYUDANTE DE CATEDRA', 'JEFE DE PRACTICAS', 'JEFE DE PRACTICAS SALUD', 'TUTOR DE INTERNADO', null].includes(reporteDocente.rol2025_1)) {
            continue;
        }

        // 🆕 NUEVA LÓGICA: Evaluar todos los perfiles posibles y elegir el mejor
        const perfilesCandidatos = [];
        
        for (const encuesta of encuestasOrdenadas) {
            const cursosQueCoinciden = cursosDelDocente.filter(curso =>
                curso.derived_programa === encuesta.programa && 
                curso.derived_modalidad === encuesta.modalidad
            );
            
            if (cursosQueCoinciden.length > 0) {
                // Deduplificar horarios (tu lógica existente)
                const cursosProcesados = new Map();
                for (const curso of cursosQueCoinciden) {
                    const tempCurso = { ...curso };
                    delete tempCurso.codProgramasCompartidos;
                    delete tempCurso.programasCompartidos;
                    const claveUnica = JSON.stringify(tempCurso);
                    if (!cursosProcesados.has(claveUnica)) {
                        cursosProcesados.set(claveUnica, curso);
                    }
                }
                const cursosUnicos = Array.from(cursosProcesados.values());
                
                if (cursosUnicos.length > 0) {
                    const pidd = piddMap.get(idDocente);
                    
                    perfilesCandidatos.push({
                        programa: encuesta.programa,
                        modalidad: encuesta.modalidad,
                        promedioEsa: encuesta.promedioEsa,
                        pidd: pidd,
                        cursosUnicos: cursosUnicos,
                        // Métricas para priorización
                        cantidadCursos: cursosUnicos.length,
                        cantidadHorarios: cursosUnicos.reduce((acc, curso) => acc + 1, 0), // Contar horarios únicos
                        tienePidd: !!pidd,
                        esPiddEspecifico: pidd && (pidd.tipoPlanIntegral === 'ESA POR CURSO' || pidd.tipoPlanIntegral === 'ESA POR CURSO-GENERAL'),
                        coincidePiddConPrograma: pidd && cursosUnicos.some(curso => curso.codCurso === pidd.codCurso)
                    });
                }
            }
        }
        
        if (perfilesCandidatos.length === 0) continue;
        
        // 🎯 ALGORITMO DE PRIORIZACIÓN INTELIGENTE
        const perfilElegido = priorizarPerfil(perfilesCandidatos);
        
        // Crear el perfil único
        const perfilDoc = {
            idDocente,
            docente: perfilElegido.cursosUnicos[0].docente,
            RolColaborador: reporteDocente.rol2025_1,
            programa: perfilElegido.programa,
            modalidad: perfilElegido.modalidad,
            promedioEsa: perfilElegido.promedioEsa,
            pidd: perfilElegido.pidd,
            // 🆕 Metadatos de decisión (para auditoría)
            metadatos: {
                perfilesEvaluados: perfilesCandidatos.length,
                criterioEleccion: perfilElegido.criterioEleccion,
                perfilesAlternativos: perfilesCandidatos.filter(p => p !== perfilElegido).map(p => ({
                    programa: p.programa,
                    modalidad: p.modalidad,
                    promedioEsa: p.promedioEsa,
                    cantidadCursos: p.cantidadCursos
                }))
            }
        };
        
        perfilesParaGuardar.push(perfilDoc);
        
        // Procesar cursos y horarios del perfil elegido
        const cursosAgrupadosMap = new Map();
        for (const curso of perfilElegido.cursosUnicos) {
            if (!cursosAgrupadosMap.has(curso.seccion)) {
                cursosAgrupadosMap.set(curso.seccion, {
                    seccion: curso.seccion,
                    nrc: curso.nrc,
                    nombreCurso: curso.nombreCurso,
                    codCurso: curso.codCurso,
                    periodo: curso.periodo,
                    metEdu: curso.metEdu,
                    idDocente: idDocente,
                    programa: perfilElegido.programa,
                    modalidad: perfilElegido.modalidad,
                });
            }
            
            const horarioDoc = {
                seccion: curso.seccion,
                fechaInicio: curso.fechaInicio,
                fechaFin: curso.fechaFin,
                dia: curso.dia,
                hora: curso.hora,
                turno: curso.turno,
                edificio: curso.edificio,
                campus: curso.campus,
                aula: curso.aula,
            };
            horariosParaGuardar.push(horarioDoc);
        }
        
        cursosParaGuardar.push(...Array.from(cursosAgrupadosMap.values()));
    }
    console.log(`Procesamiento completado. Perfiles: ${perfilesParaGuardar.length}, Cursos: ${cursosParaGuardar.length}, Horarios: ${horariosParaGuardar.length}`);
    
    // --- 4. Guardar los resultados en las colecciones de destino ---
    const colecciones = {
        perfiles: db.collection('docentes_perfiles'),
        cursos: db.collection('docentes_cursos'),
        horarios: db.collection('cursos_horarios')
    };

    if (perfilesParaGuardar.length > 0) {
        const fechaHoraEjecucion = new Date();

        // Borrar datos de la ejecución anterior para el mismo semestre
        console.log(`Eliminando datos anteriores para el semestre ${semestre}...`);
        await Promise.all([
            colecciones.perfiles.deleteMany({ semestre: semestre }),
            colecciones.cursos.deleteMany({ semestre: semestre }),
            colecciones.horarios.deleteMany({ semestre: semestre })
        ]);
        console.log('Datos anteriores eliminados.');

        // Añadir metadatos y guardar los nuevos documentos
        const docsPerfiles = perfilesParaGuardar.map(doc => ({ ...doc, semestre, fechaHoraEjecucion }));
        const docsCursos = cursosParaGuardar.map(doc => ({ ...doc, semestre, fechaHoraEjecucion }));
        const docsHorarios = horariosParaGuardar.map(doc => ({ ...doc, semestre, fechaHoraEjecucion }));

        await Promise.all([
            colecciones.perfiles.insertMany(docsPerfiles),
            colecciones.cursos.insertMany(docsCursos),
            colecciones.horarios.insertMany(docsHorarios)
        ]);
        
        console.log(`Nuevos datos guardados. Perfiles: ${docsPerfiles.length}, Cursos: ${docsCursos.length}, Horarios: ${docsHorarios.length}`);
    } else {
        console.log(`No se generaron nuevos documentos para esta ejecución.`);
    }

    return {
        perfiles: perfilesParaGuardar,
        cursos: cursosParaGuardar,
        horarios: horariosParaGuardar
    };

  } catch (error) {
    console.error(`Error en la ejecución de spDA004NormalizarAsignaciones para el semestre ${semestre}:`, error);
    throw error;
  }
}

// 🎯 FUNCIÓN DE PRIORIZACIÓN CORREGIDA
function priorizarPerfil(perfilesCandidatos) {
    // Regla 1: PIDD específico que coincide con cursos programados
    const conPiddCoincidente = perfilesCandidatos.filter(p => p.esPiddEspecifico && p.coincidePiddConPrograma);
    if (conPiddCoincidente.length > 0) {
        // Para PIDD: priorizar el ESA MÁS BAJO (peor desempeño = mayor prioridad)
        const elegido = conPiddCoincidente.sort((a, b) => a.promedioEsa - b.promedioEsa)[0];
        elegido.criterioEleccion = 'PIDD_ESPECIFICO_COINCIDENTE';
        return elegido;
    }
    
    // Regla 2: PIDD específico (aunque no coincida perfectamente)
    const conPiddEspecifico = perfilesCandidatos.filter(p => p.esPiddEspecifico);
    if (conPiddEspecifico.length > 0) {
        // Para PIDD: ESA más bajo tiene prioridad
        const elegido = conPiddEspecifico.sort((a, b) => a.promedioEsa - b.promedioEsa)[0];
        elegido.criterioEleccion = 'PIDD_ESPECIFICO';
        return elegido;
    }
    
    // Regla 3: Cualquier PIDD
    const conPidd = perfilesCandidatos.filter(p => p.tienePidd);
    if (conPidd.length > 0) {
        // Para PIDD: ESA más bajo tiene prioridad
        const elegido = conPidd.sort((a, b) => a.promedioEsa - b.promedioEsa)[0];
        elegido.criterioEleccion = 'CON_PIDD';
        return elegido;
    }
    
    // Regla 4: Sin PIDD - priorizar ESA MÁS BAJO (peor desempeño necesita más acompañamiento)
    const elegido = perfilesCandidatos.sort((a, b) => a.promedioEsa - b.promedioEsa)[0];
    elegido.criterioEleccion = 'PEOR_ESA_SIN_PIDD';
    return elegido;
}

// 🆕 FUNCIÓN OPCIONAL: Generar reporte de decisiones
function generarReporteDecisiones(perfiles) {
    const resumen = {
        totalDocentes: perfiles.length,
        criterios: {},
        ejemplos: {}
    };
    
    perfiles.forEach(perfil => {
        const criterio = perfil.metadatos.criterioEleccion;
        resumen.criterios[criterio] = (resumen.criterios[criterio] || 0) + 1;
        
        if (!resumen.ejemplos[criterio]) {
            resumen.ejemplos[criterio] = {
                docente: perfil.docente,
                programa: perfil.programa,
                modalidad: perfil.modalidad,
                promedioEsa: perfil.promedioEsa,
                alternativasDescartadas: perfil.metadatos.perfilesAlternativos.length
            };
        }
    });
    
    console.log('\n=== REPORTE DE DECISIONES DE PRIORIZACIÓN ===');
    console.log('Criterios utilizados:');
    Object.entries(resumen.criterios).forEach(([criterio, cantidad]) => {
        console.log(`  ${criterio}: ${cantidad} docentes`);
    });
    
    console.log('\nEjemplos por criterio:');
    Object.entries(resumen.ejemplos).forEach(([criterio, ejemplo]) => {
        console.log(`  ${criterio}: ${ejemplo.docente} (${ejemplo.programa}-${ejemplo.modalidad}, ESA: ${ejemplo.promedioEsa})`);
    });
    
    return resumen;
}

module.exports = { spDA004NormalizarAsignaciones };
