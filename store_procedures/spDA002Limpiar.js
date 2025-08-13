/**
 * @fileoverview
 * Este script procesa diversas fuentes de datos (programación horaria, encuestas, reportes, etc.)
 * para generar una colección denormalizada en MongoDB. La colección de destino,
 * 'asignacionespecialistadocentes', contiene el perfil completo y los horarios de los
 * docentes seleccionados para el programa de acompañamiento, facilitando así su gestión.
 *
 * @version 12.0.0 (Inclusión del campo 'facultad' en la salida)
 * @author Gemini
 */

const mongoose = require('mongoose');

// --- SECCIÓN DE CONFIGURACIÓN CENTRALIZADA ---

/**
 * @description
 * Objeto de configuración que centraliza constantes y reglas de negocio.
 * Facilita la modificación de parámetros sin alterar la lógica principal.
 */
const CONFIG = {
    SEMESTRE_ACTUAL: "2025-1", // Semestre a procesar. Se puede pasar como argumento.
    COLECCIONES: {
        ASIGNACIONES: 'asignacionespecialistadocentes',
        ENCUESTAS: 'encuestaesas',
        PROGRAMACION: 'programacionhorarias',
        REPORTE_DOCENTES: 'reporteunicodocentes',
        PIDD: 'planintegraldocentes',
        INDUCCION: 'inducciondocentes',
        PERIODOS: 'periodos',
        SUPERMALLA: 'supermallas'
    },
    ROLES_EXCLUIDOS: [
        'AYUDANTE DE CATEDRA',
        'JEFE DE PRACTICAS',
        'JEFE DE PRACTICAS SALUD',
        'TUTOR DE INTERNADO',
        null // También excluye docentes sin rol definido
    ],
    CARGOS_INDUCCION_EXCLUIDOS: [
        'JEFE DE PRACTICAS INTERNO CIENCIAS DE LA SALUD',
        'JEFE DE PRACTICAS',
        'FACILITADOR DE TALLER EXTRACURRICULAR'
    ],
    SEGMENTOS: {
        NOMBRES: {
            PIDD: 'PIDD',
            INDUCCION: 'NUEVO',
            MALLA_2025: 'MALLA 2025',
            RENDIMIENTO_C: 'C',
            RENDIMIENTO_B: 'B',
            RENDIMIENTO_A: 'A'
        },
        RANGOS_ESA: {
            C: { min: -Infinity, max: 0.3 }, // < 0.3
            B: { min: 0.3, max: 0.5 },     // >= 0.3 y < 0.5
            A: { min: 0.5, max: 1.0 }      // >= 0.5 y <= 1.0
        },
        ACTIVIDADES: {
            'NUEVO': [
                { actividad: "Asesoría", semana: "0-2", matchHorario: true },
                { actividad: "Seguimiento", semana: "3-9", matchHorario: true },
                { actividad: "Seguimiento", semana: "10-16", matchHorario: false },
            ],
            'PIDD': [
                { actividad: "Asesoría", semana: "0-2", matchHorario: true },
                { actividad: "Seguimiento", semana: "3-9", matchHorario: true },
                { actividad: "Seguimiento", semana: "10-16", matchHorario: true },
            ],
            'MALLA 2025': [
                { actividad: "Seguimiento", semana: "3-9", matchHorario: true },
            ],
            'C': [
                { actividad: "Seguimiento", semana: "3-9", matchHorario: true },
                { actividad: "Seguimiento", semana: "10-16", matchHorario: true },
            ],
            'B': [
                { actividad: "Seguimiento", semana: "3-9", matchHorario: false },
                { actividad: "Seguimiento", semana: "10-16", matchHorario: false },
            ],
            'A': [
                { actividad: "Seguimiento", semana: "10-16", matchHorario: false },
            ]
        }
    }
};


// --- SECCIÓN DE FUNCIONES HELPERS Y DE LÓGICA DE NEGOCIO ---

/**
 * Obtiene la fecha de carga más reciente de una colección para asegurar que se procesan los datos más actuales.
 * @param {mongoose.Db} db - Instancia de la base de datos de MongoDB.
 * @param {string} collectionName - Nombre de la colección.
 * @returns {Promise<string|null>} La fecha más reciente como string (YYYY-MM-DD) o null si no se encuentra.
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
 * Aplica reglas de negocio para determinar el programa y la modalidad de un curso.
 * Esta función centraliza la lógica de derivación para mantenerla consistente.
 * @param {object} prog - El objeto del curso de la colección de programación horaria.
 * @param {Map<string, string>} periodoMap - Un mapa que relaciona periodos con programas (ej. '225434' -> 'UG').
 * @returns {{derived_programa: string, derived_modalidad: string}} Un objeto con el programa y la modalidad derivados.
 */
function derivarProgramaYModalidad(prog, periodoMap) {
    let programa = 'N/A';
    let modalidad = 'Sin Definir';

    // Normalizar datos de entrada para evitar errores por mayúsculas/minúsculas o espacios.
    const codProgramas = (prog.codProgramasCompartidos || '').split(',').map(s => s.trim().toUpperCase());
    const campus = (prog.campus || '').toUpperCase();
    const periodo = prog.periodo || '';
    const nombreCurso = (prog.nombreCurso || '').toUpperCase();
    const programaDePeriodo = (periodoMap.get(periodo) || '').toUpperCase();

    /**
     * Helper para verificar si alguno de los códigos de programa coincide con un sufijo o es exacto.
     * @param {string} sufijo - El sufijo del programa a buscar (ej. 'WA', 'UG').
     * @returns {boolean}
     */
    const tieneCodigo = (sufijo) => codProgramas.some(code => code.endsWith(`-${sufijo}`) || code === sufijo);

    // Regla 1: Programas WA o WS
    if (tieneCodigo('WA') || tieneCodigo('WS')) {
        programa = 'WA';
        if (campus === 'REM') modalidad = 'SÍNCRONO';
        else if (campus === 'VIR') modalidad = 'VIRTUAL REGULAR';
        else modalidad = 'PRESENCIAL';
    }
    // Regla 2: Programa WV
    else if (tieneCodigo('WV')) {
        programa = 'WA CAD';
        if (campus === 'REM') modalidad = 'SÍNCRONO';
        else if (campus === 'VIR') modalidad = 'VIRTUAL ASÍNCRONO';
    }
    // Regla 3: Programa UG (lógica simplificada: se determina solo por el periodo '225434')
    else if (periodo === '225434') {
        programa = 'UG';
        if (campus === 'REM') modalidad = 'SÍNCRONO';
        else if (campus === 'VIR') modalidad = 'VIRTUAL REGULAR';
        else modalidad = 'PRESENCIAL';
    }

    // Regla 4: Override para cursos de Tesis. Se usa la facultad del curso (prog.facultad).
    const esCursoDeTesisPorNombre = ['TALLER DE TESIS 1', 'TALLER DE TESIS 2', 'TESIS', 'TRABAJO DE INVESTIGACIÓN'].some(c => nombreCurso.includes(c));
    const facultadDelCurso = (prog.facultad || '').toUpperCase();
    const esFacultadRequerida = (facultadDelCurso === 'ESTUDIOS GENERALES');

    const esTesis = esCursoDeTesisPorNombre && esFacultadRequerida;

    if (esTesis) {
        modalidad = 'TESIS'; // Se asigna la modalidad especial.
        // Se re-evalúa el programa para asegurar que sea el correcto (UG o WA).
        if (tieneCodigo('WA') || tieneCodigo('WS')) {
            programa = 'WA';
        } else if (tieneCodigo('UG') || programaDePeriodo === 'UG') {
            programa = 'UG';
        }
    }

    return { derived_programa: programa, derived_modalidad: modalidad };
}


/**
 * Prioriza el perfil de rendimiento de un docente según reglas de negocio cuando hay múltiples opciones.
 * @param {Array<object>} perfilesCandidatos - Lista de perfiles posibles para un docente.
 * @returns {object} El perfil elegido con un criterio de elección.
 */
function priorizarPerfil(perfilesCandidatos) {
    // Orden de prioridad:
    // 1. PIDD específico que coincide con un curso programado.
    // 2. PIDD específico (aunque no coincida).
    // 3. Cualquier tipo de PIDD.
    // 4. Si no hay PIDD, el perfil con el promedio ESA más bajo.

    const piddCoincidente = perfilesCandidatos.filter(p => p.esPiddEspecifico && p.coincidePiddConPrograma);
    if (piddCoincidente.length > 0) {
        const elegido = piddCoincidente.sort((a, b) => (a.promedioEsa ?? Infinity) - (b.promedioEsa ?? Infinity))[0];
        elegido.criterioEleccion = 'PIDD_ESPECIFICO_COINCIDENTE';
        return elegido;
    }

    const piddEspecifico = perfilesCandidatos.filter(p => p.esPiddEspecifico);
    if (piddEspecifico.length > 0) {
        const elegido = piddEspecifico.sort((a, b) => (a.promedioEsa ?? Infinity) - (b.promedioEsa ?? Infinity))[0];
        elegido.criterioEleccion = 'PIDD_ESPECIFICO';
        return elegido;
    }

    const conPidd = perfilesCandidatos.filter(p => p.tienePidd);
    if (conPidd.length > 0) {
        const elegido = conPidd.sort((a, b) => (a.promedioEsa ?? Infinity) - (b.promedioEsa ?? Infinity))[0];
        elegido.criterioEleccion = 'CON_PIDD';
        return elegido;
    }

    const peorEsa = perfilesCandidatos.sort((a, b) => (a.promedioEsa ?? Infinity) - (b.promedioEsa ?? Infinity))[0];
    peorEsa.criterioEleccion = 'PEOR_ESA_SIN_PIDD';
    return peorEsa;
}

/**
 * Calcula el programa y modalidad con la mayor carga horaria para un docente.
 * @param {Array<object>} programacion - La lista de cursos programados para un docente.
 * @returns {{programa: string, modalidad: string, cursosCoincidentes: Array<object>}} El perfil con mayor carga y sus cursos.
 */
function calcularCargaHorariaPrincipal(programacion) {
    const cargaPorPerfil = new Map(); // Usar un Map es más robusto para claves complejas

    for (const curso of programacion) {
        // Saltar si faltan datos clave para el cálculo
        if (!curso.hora || !curso.derived_programa || !curso.derived_modalidad) {
            continue;
        }

        try {
            const [inicio, fin] = curso.hora.split(' - ').map(t => t.trim());

            const h1 = parseInt(inicio.substring(0, 2), 10);
            const m1 = parseInt(inicio.substring(2, 4), 10);
            const h2 = parseInt(fin.substring(0, 2), 10);
            const m2 = parseInt(fin.substring(2, 4), 10);

            // Validar que las horas y minutos sean números
            if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) {
                console.warn(`Formato de hora inválido para el curso ${curso.nrc} (${curso.seccion}): ${curso.hora}`);
                continue;
            }

            const duracionMinutos = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (duracionMinutos <= 0) continue; // Ignorar duraciones no positivas

            const perfilKey = `${curso.derived_programa}|${curso.derived_modalidad}`;
            const cargaActual = cargaPorPerfil.get(perfilKey) || 0;
            cargaPorPerfil.set(perfilKey, cargaActual + duracionMinutos);

        } catch (e) {
            console.warn(`No se pudo procesar la hora para el curso ${curso.nrc} (${curso.seccion}): ${curso.hora}`, e);
            continue;
        }
    }

    if (cargaPorPerfil.size === 0) {
        // Fallback: si no se pudo calcular ninguna carga, usar el primer curso como referencia
        if (programacion.length > 0) {
            const primerCurso = programacion[0];
            const programa = primerCurso.derived_programa || 'N/A';
            const modalidad = primerCurso.derived_modalidad || 'N/A';
            return {
                programa,
                modalidad,
                cursosCoincidentes: programacion.filter(c => c.derived_programa === programa && c.derived_modalidad === modalidad)
            };
        }
        return { programa: 'N/A', modalidad: 'N/A', cursosCoincidentes: [] };
    }

    // Encontrar el perfil con la máxima carga horaria
    let maxCarga = 0;
    let perfilGanadorKey = '';
    for (const [perfilKey, carga] of cargaPorPerfil.entries()) {
        if (carga > maxCarga) {
            maxCarga = carga;
            perfilGanadorKey = perfilKey;
        }
    }

    const [programa, modalidad] = perfilGanadorKey.split('|');

    // Filtrar los cursos que corresponden al perfil ganador
    const cursosCoincidentes = programacion.filter(c => c.derived_programa === programa && c.derived_modalidad === modalidad);

    return { programa, modalidad, cursosCoincidentes };
}


// --- SECCIÓN DE LÓGICA PRINCIPAL DEL PROCESO ETL ---

/**
 * Paso 1: Carga todos los datos necesarios desde las colecciones de origen en MongoDB.
 * @param {mongoose.Db} db - Instancia de la base de datos.
 * @param {string} semestre - Semestre a procesar.
 * @returns {Promise<object>} Un objeto con todos los datos cargados.
 */
async function cargarDatosFuente(db, semestre) {
    console.log("--- Paso 1: Cargando datos fuente desde MongoDB ---");

    const [
        latestEncuestaDate, latestProgramacionDate, latestReporteDate,
        latestPlanDate, latestInduccionDate
    ] = await Promise.all([
        getLatestDate(db, CONFIG.COLECCIONES.ENCUESTAS),
        getLatestDate(db, CONFIG.COLECCIONES.PROGRAMACION),
        getLatestDate(db, CONFIG.COLECCIONES.REPORTE_DOCENTES),
        getLatestDate(db, CONFIG.COLECCIONES.PIDD),
        getLatestDate(db, CONFIG.COLECCIONES.INDUCCION)
    ]);

    const [
        programacionCompleta, encuestasCompletas, reportesCompletos,
        piddCompletos, periodos, induccionesFiltradas, supermallas
    ] = await Promise.all([
        db.collection(CONFIG.COLECCIONES.PROGRAMACION).find({ fechaCarga: latestProgramacionDate, idPrinc: 'Y' }).toArray(),
        db.collection(CONFIG.COLECCIONES.ENCUESTAS).find({ fechaCarga: latestEncuestaDate }).toArray(),
        db.collection(CONFIG.COLECCIONES.REPORTE_DOCENTES).find({ fechaCarga: latestReporteDate }).toArray(),
        db.collection(CONFIG.COLECCIONES.PIDD).find({ fechaCarga: latestPlanDate }).toArray(),
        db.collection(CONFIG.COLECCIONES.PERIODOS).find({}).toArray(),
        db.collection(CONFIG.COLECCIONES.INDUCCION).find({
            fechaCarga: latestInduccionDate,
            semestre: semestre,
            cargo_ingreso: { $nin: CONFIG.CARGOS_INDUCCION_EXCLUIDOS },
            criterio_induccion_25_2: 'Nuevo'
        }).toArray(),
        db.collection(CONFIG.COLECCIONES.SUPERMALLA).find({}).toArray()
    ]);

    console.log("Datos fuente cargados correctamente.");
    return { programacionCompleta, encuestasCompletas, reportesCompletos, piddCompletos, periodos, induccionesFiltradas, supermallas };
}

/**
 * Paso 2: Crea mapas de búsqueda (lookups) para un acceso eficiente a los datos.
 * @param {object} datosFuente - Objeto con los datos cargados.
 * @returns {object} Un objeto con todos los mapas de búsqueda.
 */
function crearMapasDeBusqueda(datosFuente) {
    console.log("--- Paso 2: Creando mapas de búsqueda para optimizar cruces ---");

    const reporteMap = new Map(datosFuente.reportesCompletos.map(r => [r.codigoBanner.toUpperCase(), r]));
    const piddMap = new Map(datosFuente.piddCompletos.map(p => [p.banner.toUpperCase(), p]));
    const induccionMap = new Map(datosFuente.induccionesFiltradas.map(i => [i.idDocente.toUpperCase(), i]));
    const periodoMap = new Map(datosFuente.periodos.map(p => [p.periodo, p.programa]));
    const supermallaMap = new Map(datosFuente.supermallas.map(s => [s.curso.toUpperCase(), s]));

    const esaMap = new Map();
    for (const encuesta of datosFuente.encuestasCompletas) {
        const codBanner = encuesta.codBanner.toUpperCase();
        if (!esaMap.has(codBanner)) esaMap.set(codBanner, []);
        esaMap.get(codBanner).push(encuesta);
    }
    esaMap.forEach(encuestas => encuestas.sort((a, b) => (a.promedioEsa ?? Infinity) - (b.promedioEsa ?? Infinity)));

    console.log("Mapas de búsqueda creados.");
    return { reporteMap, piddMap, induccionMap, periodoMap, supermallaMap, esaMap };
}

/**
 * Paso 3: Construye un perfil completo para cada docente, enriqueciendo sus datos.
 * @param {Array<object>} programacionCompleta - La programación horaria completa.
 * @param {object} mapas - Objeto con todos los mapas de búsqueda.
 * @returns {Map<string, object>} Un mapa con el perfil completo de cada docente.
 */
function construirPerfilesDocentes(programacionCompleta, mapas) {
    console.log("--- Paso 3: Construyendo perfiles completos de docentes ---");
    const docentesMap = new Map();

    for (const prog of programacionCompleta) {
        const idDocente = prog.idDocente.toUpperCase();

        if (!docentesMap.has(idDocente)) {
            const reporteData = mapas.reporteMap.get(idDocente) || null;
            docentesMap.set(idDocente, {
                idDocente: idDocente,
                nombreDocente: prog.docente,
                rud: reporteData,
                pidd: mapas.piddMap.get(idDocente) || null,
                inducciondocente: mapas.induccionMap.get(idDocente) || null,
                esa: mapas.esaMap.get(idDocente) || [],
                programacion: []
            });
        }

        const docenteData = docentesMap.get(idDocente);
        
        const { derived_programa, derived_modalidad } = derivarProgramaYModalidad(prog, mapas.periodoMap);
        
        docenteData.programacion.push({ ...prog, derived_programa, derived_modalidad });
    }

    console.log(`Se han construido ${docentesMap.size} perfiles completos.`);
    return docentesMap;
}

/**
 * Paso 4: Procesa los perfiles, aplica filtros, segmenta y crea los documentos finales.
 * @param {Map<string, object>} docentesMap - Mapa con los perfiles de docentes.
 * @param {Map<string, object>} supermallaMap - Mapa de la supermalla para la regla de Malla 2025.
 * @param {string} semestre - Semestre actual.
 * @returns {Array<object>} Una lista de documentos de asignación listos para ser guardados.
 */
function procesarAsignaciones(docentesMap, supermallaMap, semestre) {
    console.log("--- Paso 4: Aplicando filtros, segmentación y generando documentos finales ---");
    const asignacionesFinales = [];

    for (const docente of docentesMap.values()) {
        // Filtro 1: Descartar por rol no elegible
        if (!docente.rud || CONFIG.ROLES_EXCLUIDOS.includes(docente.rud.rol2025_1)) {
            continue;
        }

        let perfilElegido = null;
        let asignadoPor = ''; // Flag para saber cómo se asignó el perfil

        // Prioridad 1: Docentes de Inducción
        if (docente.inducciondocente) {
            const primerCurso = docente.programacion[0];
            perfilElegido = {
                programa: primerCurso ? primerCurso.derived_programa : 'N/A',
                modalidad: primerCurso ? primerCurso.derived_modalidad : 'N/A',
                promedioEsa: null,
                cursosUnicos: docente.programacion,
                criterioEleccion: 'DOCENTE_INDUCCION'
            };
            asignadoPor = 'INDUCCION';
        }

        // Prioridad 2: Docentes con PIDD aplicable para el semestre actual
        if (!perfilElegido && docente.pidd) {
            const tipoPidd = (docente.pidd.tipoPlanIntegral || '').toUpperCase();

            if (tipoPidd.includes('GENERAL')) {
                // Para PIDD General, se busca el programa/modalidad con mayor carga horaria.
                if (docente.programacion.length > 0) {
                    const { programa, modalidad, cursosCoincidentes } = calcularCargaHorariaPrincipal(docente.programacion);

                    if (programa !== 'N/A' && cursosCoincidentes.length > 0) {
                        perfilElegido = {
                            programa: programa,
                            modalidad: modalidad,
                            promedioEsa: docente.pidd.esa,
                            cursosUnicos: cursosCoincidentes, // Solo los cursos del perfil con más carga
                            criterioEleccion: 'DOCENTE_CON_PIDD_GENERAL_POR_CARGA_HORARIA'
                        };
                        asignadoPor = 'PIDD';
                    }
                }
            } else {
                // Lógica para PIDD específicos (ej. por CURSO).
                // Se valida que el curso, programa y modalidad del PIDD coincidan con la programación actual.
                const programaPIDD = docente.pidd.programaCurso || 'N/A';
                const modalidadPIDD = docente.pidd.modalidadCurso || 'N/A';
                const nombreCursoPIDD = (docente.pidd.nombreCurso || '').toUpperCase();

                const cursosCoincidentes = docente.programacion.filter(c =>
                    c.derived_programa === programaPIDD &&
                    c.derived_modalidad === modalidadPIDD &&
                    (c.nombreCurso || '').toUpperCase() === nombreCursoPIDD
                );

                // Si hay al menos un curso que cumple con todas las condiciones del PIDD específico.
                if (cursosCoincidentes.length > 0) {
                    perfilElegido = {
                        programa: programaPIDD,
                        modalidad: modalidadPIDD,
                        promedioEsa: docente.pidd.esa,
                        cursosUnicos: cursosCoincidentes,
                        criterioEleccion: `DOCENTE_CON_PIDD_${tipoPidd.replace(/\s*\/|\s+/g, '_') || 'INDEFINIDO'}`
                    };
                    asignadoPor = 'PIDD';
                }
                // Si no hay coincidencia, el proceso continuará y el docente será evaluado por ESA.
            }
        }

        // Prioridad 3: Si no fue por Inducción ni PIDD, se evalúa por rendimiento (ESA)
        if (!perfilElegido) {
            const perfilesCandidatos = [];
            for (const encuesta of docente.esa) {
                const cursosQueCoinciden = docente.programacion.filter(curso =>
                    curso.derived_programa === encuesta.programa &&
                    curso.derived_modalidad === encuesta.modalidad
                );

                if (cursosQueCoinciden.length > 0) {
                    perfilesCandidatos.push({
                        programa: encuesta.programa,
                        modalidad: encuesta.modalidad,
                        promedioEsa: encuesta.promedioEsa,
                        cursosUnicos: cursosQueCoinciden,
                        tienePidd: false,
                        esPiddEspecifico: false,
                        coincidePiddConPrograma: false
                    });
                }
            }

            if (perfilesCandidatos.length > 0) {
                perfilElegido = priorizarPerfil(perfilesCandidatos);
                asignadoPor = 'ESA';
            } else {
                // Si no se puede determinar un perfil, se salta al siguiente docente
                continue;
            }
        }

        if (!perfilElegido) continue; // Si después de todo no hay perfil, saltar

        // --- Lógica de Segmentación ---
        const segmentosAsignados = new Map();
        const addSegmento = (nombreSegmento) => {
            if (!segmentosAsignados.has(nombreSegmento)) {
                segmentosAsignados.set(nombreSegmento, {
                    segmento: nombreSegmento,
                    actividades: CONFIG.SEGMENTOS.ACTIVIDADES[nombreSegmento] || []
                });
            }
        };

        // Añadir segmento principal basado en cómo fue elegido
        if (asignadoPor === 'INDUCCION') addSegmento(CONFIG.SEGMENTOS.NOMBRES.INDUCCION);
        if (asignadoPor === 'PIDD') addSegmento(CONFIG.SEGMENTOS.NOMBRES.PIDD);

        // Añadir segmentos de rendimiento (ESA) para todos los perfiles que tengan promedio
        if (perfilElegido.promedioEsa !== null && perfilElegido.promedioEsa !== undefined) {
            const { promedioEsa } = perfilElegido;
            if (promedioEsa < CONFIG.SEGMENTOS.RANGOS_ESA.C.max) addSegmento(CONFIG.SEGMENTOS.NOMBRES.RENDIMIENTO_C);
            else if (promedioEsa < CONFIG.SEGMENTOS.RANGOS_ESA.B.max) addSegmento(CONFIG.SEGMENTOS.NOMBRES.RENDIMIENTO_B);
            else if (promedioEsa <= CONFIG.SEGMENTOS.RANGOS_ESA.A.max) addSegmento(CONFIG.SEGMENTOS.NOMBRES.RENDIMIENTO_A);
        }

        // Estructura final: Agrupar horarios y construir documento de asignación
        const cursosAgrupadosMap = new Map();
        for (const curso of perfilElegido.cursosUnicos) {
            if (!cursosAgrupadosMap.has(curso.seccion)) {
                cursosAgrupadosMap.set(curso.seccion, {
                    nombreCurso: curso.nombreCurso, codCurso: curso.codCurso, seccion: curso.seccion,
                    periodo: curso.periodo, nrc: curso.nrc, metEdu: curso.metEdu, horarios: [],
                    supermalla: supermallaMap.get(curso.nombreCurso.toUpperCase()) || null,
                });
            }
            cursosAgrupadosMap.get(curso.seccion).horarios.push({
                fechaInicio: curso.fechaInicio, fechaFin: curso.fechaFin, dia: curso.dia, hora: curso.hora,
                turno: curso.turno, edificio: curso.edificio, campus: curso.campus, aula: curso.aula,
            });
        }

        const cursosAgrupados = Array.from(cursosAgrupadosMap.values());

        // Añadir segmento Malla 2025 si corresponde, independientemente de la asignación principal
        const tieneMalla2025 = cursosAgrupados.some(c => c.supermalla && c.supermalla.ciclo === '1');
        if (tieneMalla2025) {
            addSegmento(CONFIG.SEGMENTOS.NOMBRES.MALLA_2025);
        }

        // --- MODIFICACIÓN: Obtener la facultad del perfil principal ---
        // Se asume que todos los cursos del perfil elegido pertenecen a la misma facultad.
        // Se añade un fallback por si 'cursosUnicos' estuviera vacío.
        const facultadPrincipal = perfilElegido.cursosUnicos && perfilElegido.cursosUnicos.length > 0
            ? perfilElegido.cursosUnicos[0].facultad
            : (docente.programacion.length > 0 ? docente.programacion[0].facultad : null);

        // Construcción del documento final
        asignacionesFinales.push({
            idDocente: docente.idDocente,
            docente: docente.nombreDocente,
            RolColaborador: docente.rud.rol2025_1,
            facultad: facultadPrincipal, // <-- CAMPO AÑADIDO
            programa: perfilElegido.programa,
            modalidad: perfilElegido.modalidad,
            promedioEsa: perfilElegido.promedioEsa,
            semestre: semestre,
            especialistaDni: null,
            nombreEspecialista: null,
            pidd: docente.pidd,
            rud: docente.rud,
            esa: docente.esa,
            segmentos: Array.from(segmentosAsignados.values()),
            inducciondocente: docente.inducciondocente,
            cursos: cursosAgrupados,
            estadoGeneral: 'Sin Asignar',
            criterioEleccion: perfilElegido.criterioEleccion,
        });
    }

    console.log(`Procesamiento completado. Documentos de asignación generados: ${asignacionesFinales.length}`);
    return asignacionesFinales;
}

/**
 * Paso 5: Guarda los resultados en la colección de destino, eliminando los datos anteriores.
 * @param {mongoose.Db} db - Instancia de la base de datos.
 * @param {Array<object>} asignaciones - Lista de documentos a guardar.
 * @param {string} semestre - Semestre actual.
 */
async function guardarResultados(db, asignaciones, semestre) {
    console.log("--- Paso 5: Guardando resultados en la base de datos ---");
    const asignacionesCollection = db.collection(CONFIG.COLECCIONES.ASIGNACIONES);

    if (asignaciones.length > 0) {
        const fechaHoraEjecucion = new Date();
        console.log(`Eliminando datos anteriores para el semestre ${semestre} de '${CONFIG.COLECCIONES.ASIGNACIONES}'...`);
        await asignacionesCollection.deleteMany({ semestre: semestre });
        console.log('Datos anteriores eliminados.');

        const docsParaInsertar = asignaciones.map(doc => ({ ...doc, fechaHoraEjecucion }));
        await asignacionesCollection.insertMany(docsParaInsertar);
        console.log(`Nuevos datos guardados. Documentos insertados: ${docsParaInsertar.length}`);
    } else {
        console.log(`No se generaron nuevos documentos para esta ejecución.`);
    }
}


/**
 * Función principal que orquesta el proceso de generación de asignaciones de docentes.
 * @param {string} [semestre=CONFIG.SEMESTRE_ACTUAL] - El semestre a procesar (ej. "2025-1").
 * @returns {Promise<object>} Un objeto con los resultados de la ejecución.
 */
async function spDA004GenerarAsignacionesDocentes(semestre = CONFIG.SEMESTRE_ACTUAL) {
    if (!semestre || !/^\d{4}-\d$/.test(semestre)) {
        throw new Error('El parámetro semestre es requerido y debe tener el formato "YYYY-N" (e.g., "2025-1").');
    }

    try {
        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('No se pudo obtener la instancia de la base de datos desde Mongoose.');
        }
        console.log(`\n🚀 Iniciando generación de asignaciones para el semestre: ${semestre} 🚀`);

        // Paso 1: Cargar datos
        const datosFuente = await cargarDatosFuente(db, semestre);

        // Paso 2: Crear mapas de búsqueda
        const mapas = crearMapasDeBusqueda(datosFuente);

        // Paso 3: Construir perfiles de docentes
        const docentesMap = construirPerfilesDocentes(datosFuente.programacionCompleta, mapas);

        // Paso 4: Procesar asignaciones
        const asignacionesParaGuardar = procesarAsignaciones(docentesMap, mapas.supermallaMap, semestre);

        // Paso 5: Guardar resultados
        await guardarResultados(db, asignacionesParaGuardar, semestre);

        console.log("\n✅ Proceso finalizado con éxito.");
        return {
            totalDocentesProcesados: docentesMap.size,
            totalAsignacionesGeneradas: asignacionesParaGuardar.length,
        };

    } catch (error) {
        console.error(`❌ Error Crítico en la ejecución para el semestre ${semestre}:`, error);
        throw error; // Propagar el error para que el llamador pueda manejarlo
    }
}

module.exports = { spDA004GenerarAsignacionesDocentes };
