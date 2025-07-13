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

    // --- 3. LÓGICA CENTRAL: Construir los documentos para cada colección ---
    const perfilesParaGuardar = [];
    const cursosParaGuardar = [];
    const horariosParaGuardar = [];
    const perfilesProcesados = new Set(); // Para no duplicar perfiles

    for (const [idDocente, encuestasOrdenadas] of esaOrdenadaPorDocenteMap.entries()) {
        const cursosDelDocente = programacionPorDocenteMap.get(idDocente);
        if (!cursosDelDocente) continue;

        for (const encuestaPrioritaria of encuestasOrdenadas) {
            const programaTarget = encuestaPrioritaria.programa;
            const modalidadTarget = encuestaPrioritaria.modalidad;
            
            const perfilKey = `${idDocente}-${programaTarget}-${modalidadTarget}`;
            if (perfilesProcesados.has(perfilKey)) continue; // Perfil ya procesado

            const cursosQueCoinciden = cursosDelDocente.filter(curso =>
                curso.derived_programa === programaTarget && curso.derived_modalidad === modalidadTarget
            );

            if (cursosQueCoinciden.length > 0) {
                const reporteDocente = reporteMap.get(idDocente);
                if (!reporteDocente || ['AYUDANTE DE CATEDRA', 'JEFE DE PRACTICAS', 'JEFE DE PRACTICAS SALUD', 'TUTOR DE INTERNADO', null].includes(reporteDocente.rol2025_1)) {
                    continue; // Rol no elegible, probar siguiente perfil del docente
                }

                // --- INICIO: Lógica de deduplicación de horarios ---
                // Se eliminan los horarios que son idénticos en todo excepto en los programas compartidos.
                const cursosProcesados = new Map();
                for (const curso of cursosQueCoinciden) {
                    // Se crea una copia del objeto para no modificar el original
                    const tempCurso = { ...curso };
                    // Se eliminan los campos que no deben influir en la unicidad
                    delete tempCurso.codProgramasCompartidos;
                    delete tempCurso.programasCompartidos;

                    // Se genera una clave única a partir del resto del objeto
                    const claveUnica = JSON.stringify(tempCurso);

                    // Si la clave no existe, se añade el curso original al mapa
                    if (!cursosProcesados.has(claveUnica)) {
                        cursosProcesados.set(claveUnica, curso);
                    }
                }
                const cursosUnicos = Array.from(cursosProcesados.values());
                // --- FIN: Lógica de deduplicación ---

                // Si después de la deduplicación no quedan cursos, se salta al siguiente perfil
                if (cursosUnicos.length === 0) {
                    continue;
                }

                // 3.1. Crear y guardar el documento del PERFIL
                const perfilDoc = {
                    idDocente,
                    docente: cursosUnicos[0].docente, // Usar el primer curso de la lista ya única
                    RolColaborador: reporteDocente.rol2025_1,
                    programa: programaTarget,
                    modalidad: modalidadTarget,
                    promedioEsa: encuestaPrioritaria.promedioEsa,
                    pidd: piddMap.get(idDocente) || null,
                };
                perfilesParaGuardar.push(perfilDoc);
                perfilesProcesados.add(perfilKey);

                // Agrupar por sección para no duplicar cursos
                const cursosAgrupadosMap = new Map();
                for (const curso of cursosUnicos) { // Usar la lista de cursos ya filtrada
                    if (!cursosAgrupadosMap.has(curso.seccion)) {
                        // 3.2. Crear y guardar el documento del CURSO
                        cursosAgrupadosMap.set(curso.seccion, {
                            seccion: curso.seccion,
                            nrc: curso.nrc,
                            nombreCurso: curso.nombreCurso,
                            codCurso: curso.codCurso,
                            periodo: curso.periodo,
                            metEdu: curso.metEdu,
                            // Llaves de enlace
                            idDocente: idDocente,
                            programa: programaTarget,
                            modalidad: modalidadTarget,
                        });
                    }
                    
                    // 3.3. Crear y guardar el documento del HORARIO
                    const horarioDoc = {
                        // Llave de enlace
                        seccion: curso.seccion,
                        // Datos propios del horario
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
                
                // Añadir los cursos únicos a la lista final
                cursosParaGuardar.push(...Array.from(cursosAgrupadosMap.values()));
            }
        }
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

module.exports = { spDA004NormalizarAsignaciones };
