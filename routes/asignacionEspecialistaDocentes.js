const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- MODELOS ---
// Se importan todos los modelos desde la carpeta /models
// Esto asegura que cada modelo se compila una sola vez.

// Modelos de Salida
const AsignacionEspecialistaDocente = require('../models/AsignacionEspecialistaDocente');
const HistorialAsignacion = require('../models/HistorialAsignacion');

// Modelos de Entrada
const DisponibilidadAcompaniamiento = require('../models/DisponibilidadAcompaniamiento');
const DocentePerfil = require('../models/ProgramacionHoraria/DocentePerfil');
const DocenteCurso = require('../models/ProgramacionHoraria/DocenteCurso');
const CursoHorario = require('../models/ProgramacionHoraria/CursoHorario');


/**
 * Procesa el match entre los docentes y la disponibilidad de especialistas,
 * asegurando un único especialista por docente y marcando los horarios.
 * @param {string} semestre - El semestre a procesar.
 * @returns {Promise<object>} El resultado del proceso de match.
 */
async function procesarMatch(semestre) {
    console.log(`Iniciando match para el semestre: ${semestre} con lógica de asignación por docente.`);
    const fechaHoraEjecucion = new Date();

    // 1. Obtener la fecha de la última ejecución de los datos de origen (perfiles).
    const ultimaEjecucionOrigen = await DocentePerfil.findOne({ semestre: semestre })
        .sort({ fechaHoraEjecucion: -1 })
        .select('fechaHoraEjecucion')
        .lean();

    if (!ultimaEjecucionOrigen) {
        throw new Error(`No se encontraron perfiles de origen para el semestre ${semestre}. Ejecute primero el script de normalización.`);
    }
    const fechaMasReciente = ultimaEjecucionOrigen.fechaHoraEjecucion;
    console.log(`Se usará la data de perfiles, cursos y horarios de la fecha: ${fechaMasReciente}`);

    // 2. Obtener todos los datos necesarios en paralelo.
    const [
        perfilesDocentes,
        cursosDocentes,
        horariosCursos,
        especialistasDisponibles,
        asignacionesAnteriores
    ] = await Promise.all([
        DocentePerfil.find({ semestre: semestre, fechaHoraEjecucion: fechaMasReciente }).lean(),
        DocenteCurso.find({ semestre: semestre, fechaHoraEjecucion: fechaMasReciente }).lean(),
        CursoHorario.find({ semestre: semestre, fechaHoraEjecucion: fechaMasReciente }).lean(),
        DisponibilidadAcompaniamiento.find({}).lean(),
        AsignacionEspecialistaDocente.find({ semestre: semestre }).sort({ fechaHoraEjecucion: -1 }).lean()
    ]);

    if (perfilesDocentes.length === 0) {
        return { message: 'No se encontraron perfiles de docentes para procesar.', matches: 0, sinMatch: 0 };
    }
    console.log(`Perfiles a procesar: ${perfilesDocentes.length}, Especialistas disponibles: ${especialistasDisponibles.length}`);

    // 3. Crear mapas para búsquedas eficientes y balanceo de carga.
    const disponibilidadMap = new Map(); // Para presenciales
    const disponibilidadSinSedeMap = new Map(); // Para síncronos
    const especialistasREM = new Map();
    const especialistasVIR = new Map();
    const cargaEspecialistas = new Map();

    // Inicializar listas y mapas de carga
    for (const especialista of especialistasDisponibles) {
        const dniAsString = String(especialista.dni).trim();
        if (!cargaEspecialistas.has(dniAsString)) {
            cargaEspecialistas.set(dniAsString, 0);
            const especialistaInfo = { dni: dniAsString, nombre: especialista.apellidosNombresCompletos };
            if (especialista.sede1DePreferenciaPresencial === 'REM') {
                especialistasREM.set(dniAsString, especialistaInfo);
            } else if (especialista.sede1DePreferenciaPresencial === 'VIR') {
                especialistasVIR.set(dniAsString, especialistaInfo);
            }
        }
        
        const infoParaMapa = {
            dni: dniAsString,
            nombre: especialista.apellidosNombresCompletos,
            disponibilidad: { dia: especialista.dia, franja: especialista.franja, sede: especialista.sede1DePreferenciaPresencial, turno: especialista.turno, hora: especialista.hora }
        };

        const keyConSede = `${especialista.dia}-${especialista.sede1DePreferenciaPresencial}-${especialista.franja}`;
        if (!disponibilidadMap.has(keyConSede)) disponibilidadMap.set(keyConSede, []);
        disponibilidadMap.get(keyConSede).push(infoParaMapa);

        const keySinSede = `${especialista.dia}-${especialista.franja}`;
        if (!disponibilidadSinSedeMap.has(keySinSede)) disponibilidadSinSedeMap.set(keySinSede, []);
        disponibilidadSinSedeMap.get(keySinSede).push(infoParaMapa);
    }
    console.log(`Especialistas que prefieren REM (Síncrono): ${especialistasREM.size}`);
    console.log(`Especialistas que prefieren VIR (Asíncrono): ${especialistasVIR.size}`);


    const horariosPorSeccionMap = new Map();
    for (const horario of horariosCursos) {
        if (!horariosPorSeccionMap.has(horario.seccion)) {
            horariosPorSeccionMap.set(horario.seccion, []);
        }
        horariosPorSeccionMap.get(horario.seccion).push(horario);
    }

    const cursosMap = new Map(cursosDocentes.map(curso => [curso.seccion, curso]));
    
    const mapaAsignacionPrevia = new Map();
    for (const asignacion of asignacionesAnteriores) {
        if (!mapaAsignacionPrevia.has(asignacion.idDocente)) {
            mapaAsignacionPrevia.set(asignacion.idDocente, {
                dni: asignacion.especialistaDni,
                nombre: asignacion.nombreEspecialista,
                estadoGeneral: asignacion.estadoGeneral
            });
        }
    }

    // 4. Agrupar perfiles por docente, ordenarlos y separarlos por prioridad.
    const perfilesPorDocente = new Map();
    for (const perfil of perfilesDocentes) {
        if (!perfilesPorDocente.has(perfil.idDocente)) {
            perfilesPorDocente.set(perfil.idDocente, []);
        }
        perfilesPorDocente.get(perfil.idDocente).push(perfil);
    }

    const docentesPrioritarios = new Map();
    const docentesRegulares = new Map();

    for (const [idDocente, perfiles] of perfilesPorDocente.entries()) {
        perfiles.sort((a, b) => (a.promedioEsa ?? Infinity) - (b.promedioEsa ?? Infinity));
        const perfilBase = perfiles[0];
        const pidd = perfilBase.pidd;

        if (pidd && (pidd.tipoPlanIntegral === 'ESA POR CURSO' || pidd.tipoPlanIntegral === 'ESA POR CURSO-GENERAL') && pidd.codCurso) {
            docentesPrioritarios.set(idDocente, perfiles);
        } else {
            docentesRegulares.set(idDocente, perfiles);
        }
    }
    console.log(`Docentes Prioritarios (con PIDD por curso): ${docentesPrioritarios.size}`);
    console.log(`Docentes Regulares: ${docentesRegulares.size}`);

    // 5. Procesamiento y generación de historial.
    const resultadosDelMatch = [];
    const historialAGuardar = [];
    const docentesYaAsignados = new Set();

    // --- BUCLE 1: PROCESAR DOCENTES PRIORITARIOS ---
    for (const [idDocente, perfilesOrdenados] of docentesPrioritarios.entries()) {
        if (docentesYaAsignados.has(idDocente)) continue;
        const seccionesDelCursoEspecifico = cursosDocentes
            .filter(c => c.idDocente === idDocente && c.codCurso === perfilesOrdenados[0].pidd.codCurso)
            .map(c => c.seccion);
        const horariosParaBuscar = horariosCursos.filter(h => seccionesDelCursoEspecifico.includes(h.seccion));
        
        await procesarAsignacionParaDocente(idDocente, perfilesOrdenados, horariosParaBuscar, mapaAsignacionPrevia, disponibilidadMap, disponibilidadSinSedeMap, cursosMap, horariosPorSeccionMap, cursosDocentes, resultadosDelMatch, historialAGuardar, semestre, cargaEspecialistas, especialistasREM, especialistasVIR);
        docentesYaAsignados.add(idDocente);
    }

    // --- BUCLE 2: PROCESAR DOCENTES REGULARES ---
    for (const [idDocente, perfilesOrdenados] of docentesRegulares.entries()) {
        if (docentesYaAsignados.has(idDocente)) continue;
        const horariosParaBuscar = perfilesOrdenados.flatMap(p => {
            const cursosDelPerfil = cursosDocentes.filter(c => c.idDocente === p.idDocente && c.programa === p.programa && c.modalidad === p.modalidad);
            return cursosDelPerfil.flatMap(c => (horariosPorSeccionMap.get(c.seccion) || []));
        });
        
        await procesarAsignacionParaDocente(idDocente, perfilesOrdenados, horariosParaBuscar, mapaAsignacionPrevia, disponibilidadMap, disponibilidadSinSedeMap, cursosMap, horariosPorSeccionMap, cursosDocentes, resultadosDelMatch, historialAGuardar, semestre, cargaEspecialistas, especialistasREM, especialistasVIR);
        docentesYaAsignados.add(idDocente);
    }


    // 6. Guardar los resultados en ambas colecciones.
    if (resultadosDelMatch.length > 0) {
        const matchesCount = resultadosDelMatch.filter(r => r.estadoGeneral === 'Planificado').length;
        console.log(`\nResumen: ${matchesCount} con match, ${resultadosDelMatch.length - matchesCount} sin match.`);
        
        await AsignacionEspecialistaDocente.insertMany(resultadosDelMatch.map(r => ({...r, fechaHoraEjecucion})));
        console.log('Resultados de la ejecución guardados exitosamente.');

        const historialDeCambios = historialAGuardar.filter(h => ['REASIGNADO', 'DESASIGNADO'].includes(h.estadoCambio));
        if (historialDeCambios.length > 0) {
            await HistorialAsignacion.insertMany(historialDeCambios.map(h => ({...h, fechaHoraEjecucion})));
            console.log(`Historial de cambios (${historialDeCambios.length} registros) guardado.`);
        }

        return { message: 'Proceso de match finalizado.', totalProcesados: resultadosDelMatch.length, matches: matchesCount, sinMatch: resultadosDelMatch.length - matchesCount };
    } else {
        return { message: 'Proceso finalizado, no se generaron documentos.', totalProcesados: 0, matches: 0, sinMatch: 0 };
    }
}

/**
 * Lógica encapsulada para procesar la asignación de un único docente.
 */
async function procesarAsignacionParaDocente(idDocente, perfilesOrdenados, horariosParaBuscar, mapaAsignacionPrevia, disponibilidadMap, disponibilidadSinSedeMap, cursosMap, horariosPorSeccionMap, cursosDocentes, resultadosDelMatch, historialAGuardar, semestre, cargaEspecialistas, especialistasREM, especialistasVIR) {
    const especialistaPrevio = mapaAsignacionPrevia.get(idDocente);
    let infoDelEspecialistaAsignado = null;
    let estadoCambio = '';
    const perfilBase = perfilesOrdenados[0];
    const esVirtualSincrono = perfilBase.modalidad === 'Virtual Síncrono';
    const esVirtualAsincrono = perfilBase.modalidad === 'Virtual Asíncrono';
    const esHibrido = perfilBase.modalidad === 'Híbrida';
    const todosLosEspecialistas = Array.from(cargaEspecialistas.keys()).map(dni => ({ dni, nombre: especialistasREM.get(dni)?.nombre || especialistasVIR.get(dni)?.nombre || 'Especialista Presencial' }));


    if (esVirtualAsincrono) {
        // --- LÓGICA PARA VIRTUAL ASÍNCRONO ---
        console.log(`INFO: Docente [${idDocente}] es Asíncrono. Buscando especialista VIR.`);
        if (especialistaPrevio && especialistaPrevio.estadoGeneral === 'Planificado' && especialistasVIR.has(especialistaPrevio.dni)) {
            infoDelEspecialistaAsignado = { dni: especialistaPrevio.dni, nombre: especialistaPrevio.nombre };
            estadoCambio = 'MANTENIDO';
        } else if (!especialistaPrevio && especialistasVIR.size > 0) {
            const listaEspecialistasVIR = Array.from(especialistasVIR.values());
            infoDelEspecialistaAsignado = listaEspecialistasVIR.sort((a, b) => (cargaEspecialistas.get(a.dni) || 0) - (cargaEspecialistas.get(b.dni) || 0))[0];
        }
    } else if (esVirtualSincrono) {
        // --- LÓGICA PARA VIRTUAL SÍNCRONO ---
        console.log(`INFO: Docente [${idDocente}] es Síncrono. Buscando especialista REM.`);
        if (especialistaPrevio && especialistaPrevio.estadoGeneral === 'Planificado' && especialistasREM.has(especialistaPrevio.dni)) {
            infoDelEspecialistaAsignado = { dni: especialistaPrevio.dni, nombre: especialistaPrevio.nombre };
            estadoCambio = 'MANTENIDO';
        } else if (!especialistaPrevio && especialistasREM.size > 0) {
            const listaEspecialistasREM = Array.from(especialistasREM.values());
            infoDelEspecialistaAsignado = listaEspecialistasREM.sort((a, b) => (cargaEspecialistas.get(a.dni) || 0) - (cargaEspecialistas.get(b.dni) || 0))[0];
        }
    } else if (esHibrido) {
        // --- LÓGICA PARA HÍBRIDO ---
        console.log(`INFO: Docente [${idDocente}] es Híbrido. Verificando cada horario.`);
        if (especialistaPrevio && especialistaPrevio.estadoGeneral === 'Planificado') {
            for (const horario of horariosParaBuscar) {
                const esHorarioVirtual = horario.edificio === '';
                const mapaDeBusqueda = esHorarioVirtual ? disponibilidadSinSedeMap : disponibilidadMap;
                const key = esHorarioVirtual ? `${horario.dia}-${horario.hora}` : `${horario.dia}-${horario.campus}-${horario.hora}`;
                if ((mapaDeBusqueda.get(key) || []).some(e => e.dni === especialistaPrevio.dni)) {
                    infoDelEspecialistaAsignado = { dni: especialistaPrevio.dni, nombre: especialistaPrevio.nombre };
                    estadoCambio = 'MANTENIDO';
                    break;
                }
            }
        }
        // ✅ INICIO: LÓGICA ACTUALIZADA PARA HÍBRIDO
        if (!infoDelEspecialistaAsignado) {
            // Prioridad 1: Buscar un especialista REM que cubra CUALQUIER horario virtual.
            const todosLosEspecialistasREM = new Map();
            for (const horario of horariosParaBuscar) {
                if (horario.edificio === '') { // Es un horario virtual
                    const key = `${horario.dia}-${horario.hora}`;
                    const especialistasEnHorario = (disponibilidadSinSedeMap.get(key) || []).filter(e => especialistasREM.has(e.dni));
                    for (const especialista of especialistasEnHorario) {
                        if (!todosLosEspecialistasREM.has(especialista.dni)) {
                            todosLosEspecialistasREM.set(especialista.dni, especialista);
                        }
                    }
                }
            }

            if (todosLosEspecialistasREM.size > 0) {
                const listaEspecialistas = Array.from(todosLosEspecialistasREM.values());
                // Ordenar por menor carga y asignar
                infoDelEspecialistaAsignado = listaEspecialistas.sort((a, b) =>
                    (cargaEspecialistas.get(a.dni) || 0) - (cargaEspecialistas.get(b.dni) || 0)
                )[0];
            }

            // Prioridad 2: Si no se encontró especialista REM, buscar uno presencial que cubra CUALQUIER horario presencial.
            if (!infoDelEspecialistaAsignado) {
                const todosLosEspecialistasPresenciales = new Map();
                for (const horario of horariosParaBuscar) {
                    if (horario.edificio !== '') { // Es un horario presencial
                        const key = `${horario.dia}-${horario.campus}-${horario.hora}`;
                        // Filtrar para que solo sean especialistas presenciales
                        const especialistasEnHorario = (disponibilidadMap.get(key) || []).filter(e => !especialistasREM.has(e.dni) && !especialistasVIR.has(e.dni));
                        for (const especialista of especialistasEnHorario) {
                            if (!todosLosEspecialistasPresenciales.has(especialista.dni)) {
                                todosLosEspecialistasPresenciales.set(especialista.dni, especialista);
                            }
                        }
                    }
                }

                if (todosLosEspecialistasPresenciales.size > 0) {
                    const listaEspecialistas = Array.from(todosLosEspecialistasPresenciales.values());
                     // Ordenar por menor carga y asignar
                    infoDelEspecialistaAsignado = listaEspecialistas.sort((a, b) =>
                        (cargaEspecialistas.get(a.dni) || 0) - (cargaEspecialistas.get(b.dni) || 0)
                    )[0];
                }
            }
        }
        // ✅ FIN: LÓGICA ACTUALIZADA PARA HÍBRIDO
    } else {
        // --- LÓGICA PARA MODALIDAD PRESENCIAL ---
        if (especialistaPrevio && especialistaPrevio.estadoGeneral === 'Planificado') {
            for (const horario of horariosParaBuscar) {
                const key = `${horario.dia}-${horario.campus}-${horario.hora}`;
                if ((disponibilidadMap.get(key) || []).some(e => e.dni === especialistaPrevio.dni)) {
                    infoDelEspecialistaAsignado = { dni: especialistaPrevio.dni, nombre: especialistaPrevio.nombre };
                    estadoCambio = 'MANTENIDO';
                    break;
                }
            }
        }
        if (!infoDelEspecialistaAsignado) {
            // RECOPILAR especialistas de TODOS los horarios disponibles
            const todosLosEspecialistasDisponibles = new Map();
            
            for (const horario of horariosParaBuscar) {
                const key = `${horario.dia}-${horario.campus}-${horario.hora}`;
                const especialistasEnEsteHorario = disponibilidadMap.get(key);
                
                if (especialistasEnEsteHorario) {
                    for (const especialista of especialistasEnEsteHorario) {
                        if (!todosLosEspecialistasDisponibles.has(especialista.dni)) {
                            todosLosEspecialistasDisponibles.set(especialista.dni, especialista);
                        }
                    }
                }
            }
            
            // ORDENAR por carga y seleccionar el de menor carga
            if (todosLosEspecialistasDisponibles.size > 0) {
                const listaEspecialistas = Array.from(todosLosEspecialistasDisponibles.values());
                infoDelEspecialistaAsignado = listaEspecialistas.sort((a, b) => 
                    (cargaEspecialistas.get(a.dni) || 0) - (cargaEspecialistas.get(b.dni) || 0)
                )[0];
            }
        }
    }
    
    if (infoDelEspecialistaAsignado) {
        cargaEspecialistas.set(infoDelEspecialistaAsignado.dni, (cargaEspecialistas.get(infoDelEspecialistaAsignado.dni) || 0) + 1);
    }

    // --- PREPARAR DOCUMENTO FINAL ---
    let documentoFinal;
    const todosLosCursosAnidados = [];
    const todasLasSeccionesDelDocente = new Set(cursosDocentes.filter(c => c.idDocente === idDocente).map(c => c.seccion));
    let primerMatchMarcado = false;

    // CORRECCIÓN: Crear un set con los horarios elegibles para marcar
    const horariosElegibles = new Set(horariosParaBuscar.map(h => `${h.seccion}-${h.dia}-${h.hora}`));

    todasLasSeccionesDelDocente.forEach(seccion => {
        const infoCurso = cursosMap.get(seccion);
        const horariosDelCurso = horariosPorSeccionMap.get(seccion) || [];
        if (infoCurso) {
            const horariosAnidados = horariosDelCurso.map(h => {
                const horarioConAcompanamiento = { ...h };
                if (infoDelEspecialistaAsignado) {
                    if (esVirtualSincrono || esVirtualAsincrono) {
                        const tipo = !primerMatchMarcado ? 'Recomendado' : 'Opcional';
                        horarioConAcompanamiento.acompanamiento = {
                            especialistaDni: infoDelEspecialistaAsignado.dni,
                            nombreEspecialista: infoDelEspecialistaAsignado.nombre,
                            estado: "Planificado",
                            tipo: tipo
                        };
                        if (tipo === 'Recomendado') primerMatchMarcado = true;
                    } else {
                        const horarioKey = `${h.seccion}-${h.dia}-${h.hora}`;
                        // Solo marcar si el horario estaba en la lista de búsqueda (relevante para PIDD)
                        if (horariosElegibles.has(horarioKey)) {
                            const esHorarioVirtualHibrido = esHibrido && h.edificio === '';
                            const mapaDeBusqueda = esHorarioVirtualHibrido ? disponibilidadSinSedeMap : disponibilidadMap;
                            const key = esHorarioVirtualHibrido ? `${h.dia}-${h.hora}` : `${h.dia}-${h.campus}-${h.hora}`;
                            const especialistasEnHorario = mapaDeBusqueda.get(key);

                            if (especialistasEnHorario?.some(e => e.dni === infoDelEspecialistaAsignado.dni)) {
                                const tipo = !primerMatchMarcado ? 'Recomendado' : 'Opcional';
                                horarioConAcompanamiento.acompanamiento = {
                                    especialistaDni: infoDelEspecialistaAsignado.dni,
                                    nombreEspecialista: infoDelEspecialistaAsignado.nombre,
                                    estado: "Planificado",
                                    tipo: tipo
                                };
                                if (tipo === 'Recomendado') primerMatchMarcado = true;
                            }
                        }
                    }
                }
                return horarioConAcompanamiento;
            });
            todosLosCursosAnidados.push({ ...infoCurso, horarios: horariosAnidados });
        }
    });

    const detalleAnterior = { especialistaDni: especialistaPrevio?.dni || null, nombreEspecialista: especialistaPrevio?.nombre || null };

    if (infoDelEspecialistaAsignado) {
        documentoFinal = { ...perfilBase, especialistaDni: infoDelEspecialistaAsignado.dni, nombreEspecialista: infoDelEspecialistaAsignado.nombre, cursos: todosLosCursosAnidados, semestre: semestre, estadoGeneral: 'Planificado' };
        if (estadoCambio !== 'MANTENIDO') {
            estadoCambio = especialistaPrevio?.estadoGeneral === 'Planificado' ? 'REASIGNADO' : 'ASIGNACION_NUEVA';
            const logMsg = estadoCambio === 'REASIGNADO' ? `CAMBIO: Docente [${idDocente}] de [${especialistaPrevio.nombre}] a [${infoDelEspecialistaAsignado.nombre}]` : `NUEVO MATCH: Docente [${idDocente}] a [${infoDelEspecialistaAsignado.nombre}]`;
            console[estadoCambio === 'REASIGNADO' ? 'warn' : 'log'](logMsg);
        }
    } else {
        documentoFinal = { ...perfilBase, especialistaDni: null, nombreEspecialista: null, cursos: todosLosCursosAnidados, semestre: semestre, estadoGeneral: 'Sin Asignar' };
        estadoCambio = especialistaPrevio?.estadoGeneral === 'Planificado' ? 'DESASIGNADO' : 'PERMANECE_SIN_ASIGNAR';
        const logMsg = estadoCambio === 'DESASIGNADO' ? `DESASIGNADO: Docente [${idDocente}]` : `SIN MATCH: Docente [${idDocente}]`;
        console[estadoCambio === 'DESASIGNADO' ? 'warn' : 'log'](logMsg);
    }
    
    delete documentoFinal._id;
    delete documentoFinal.fechaHoraEjecucion;
    resultadosDelMatch.push(documentoFinal);
    historialAGuardar.push({ ...documentoFinal, estadoCambio, detalleAnterior });
}


// --- RUTAS DE LA API (Sin cambios, ya que consumen el resultado final) ---

// GET: Endpoint unificado para obtener asignaciones.
router.get('/', async (req, res) => {
    try {
        const { semestre, idDocente, dniEspecialista, estadoGeneral, latest } = req.query;
        const query = {};

        if (semestre) query.semestre = semestre;
        if (idDocente) query.idDocente = idDocente;
        if (dniEspecialista) query.especialistaDni = dniEspecialista;
        if (estadoGeneral) query.estadoGeneral = estadoGeneral;

        if (latest === 'true') {
            // Buscar la ejecución más reciente, solo con filtro de semestre si existe
            const queryParaUltimaEjecucion = semestre ? { semestre } : {};
            const ultimaEjecucion = await AsignacionEspecialistaDocente.findOne(queryParaUltimaEjecucion)
                .sort({ fechaHoraEjecucion: -1 })
                .lean();
            if (ultimaEjecucion) {
                query.fechaHoraEjecucion = ultimaEjecucion.fechaHoraEjecucion;
            } else {
                return res.json({ data: [], totalDocs: 0 });
            }
        }

        let data = await AsignacionEspecialistaDocente.find(query)
            .sort({ fechaHoraEjecucion: -1, 'docente': 1 })
            .lean();

        // Si se filtra por un especialista, procesamos los resultados para devolver
        // únicamente los cursos y horarios que le corresponden.
        if (dniEspecialista && data.length > 0) {
            data = data.map(asignacion => {
                const cursosFiltrados = asignacion.cursos
                    .map(curso => {
                        const horariosFiltrados = curso.horarios.filter(horario =>
                            horario.acompanamiento && horario.acompanamiento.especialistaDni === dniEspecialista
                        );
                        if (horariosFiltrados.length > 0) {
                            return { ...curso, horarios: horariosFiltrados };
                        }
                        return null;
                    })
                    .filter(curso => curso !== null);
                return { ...asignacion, cursos: cursosFiltrados };
            });
        }

        res.json({
            data: data,
            totalDocs: data.length
        });

    } catch (err) {
        console.error("Error al obtener las asignaciones:", err);
        res.status(500).json({ message: "Error al obtener las asignaciones: " + err.message });
    }
});


// POST: Inicia el proceso de match para un semestre
router.post('/', async (req, res) => {
    const { semestre } = req.body;

    if (!semestre || !/^\d{4}-\d$/.test(semestre)) {
        return res.status(400).json({ message: 'El parámetro semestre es requerido y debe tener el formato "YYYY-N".' });
    }

    try {
        // Se llama a la nueva función de match
        const resultado = await procesarMatch(semestre);
        res.status(201).json(resultado);
    } catch (error) {
        console.error('Error al crear la asignación:', error);
        res.status(500).json({ message: 'Error interno del servidor.', error: error.message });
    }
});



// El resto de los endpoints como /especialista/:dni y /asignacion-automatica
// deberían seguir funcionando ya que leen de AsignacionEspecialistaDocente,
// cuya estructura de salida no ha cambiado. Los dejo omitidos por brevedad
// pero su lógica no necesita ser alterada.

module.exports = router;
