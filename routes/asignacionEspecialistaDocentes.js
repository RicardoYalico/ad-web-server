/**
 * Este archivo contiene la lógica y los endpoints para realizar el "match"
 * entre docentes y especialistas, incluyendo la exportación de datos.
 *
 * Versión Refactorizada 10.1 (Corrección de Filtro de Segmento):
 * - CORRECCIÓN CRÍTICA: Se ajusta la lógica de `findAndAssign` para que el filtro de
 * especialistas se base en los segmentos específicos de las actividades del período
 * actual, en lugar de todos los segmentos del docente.
 * - REGLA DE NEGOCIO MÁS ESTRICTA: Se cambia el método de comprobación de `.some()` a `.every()`
 * para garantizar que un especialista sea compatible con TODOS los segmentos requeridos
 * en un período de asignación, no solo con uno de ellos. Esto evita asignaciones incorrectas
 * como la reportada (asignar actividad PIDD a especialista no compatible con PIDD).
 * - Se mantiene la arquitectura general de la v10.0.
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const exceljs = require('exceljs');

// --- MODELOS ---
const AsignacionEspecialistaDocente = require('../models/AsignacionEspecialistaDocente');
const DisponibilidadAcompaniamiento = require('../models/DisponibilidadAcompaniamiento');

// --- CONSTANTES DE NEGOCIO ---
const FECHA_INICIO_SEMESTRE_BASE = '2025-08-06T00:00:00Z'; // Fecha de inicio del ciclo


// ===== FUNCIONES AUXILIARES =====

/**
 * Normaliza un string convirtiéndolo a mayúsculas y eliminando acentos.
 * Esencial para comparaciones de texto fiables.
 * @param {string} str El string a normalizar.
 * @returns {string} El string normalizado.
 */
function normalizarString(str) {
    if (!str) return '';
    return str
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function getPeriodoDeSemanas(rangoSemanas, semestre) {
    try {
        const [semanaInicioStr, semanaFinStr] = rangoSemanas.split('-');
        const semanaInicio = parseInt(semanaInicioStr, 10);
        const semanaFin = parseInt(semanaFinStr, 10);

        const baseDateInput = new Date(FECHA_INICIO_SEMESTRE_BASE);
        baseDateInput.setUTCHours(0, 0, 0, 0);

        const dayOfWeek = baseDateInput.getUTCDay();

        const endOfWeek0 = new Date(baseDateInput);
        const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        endOfWeek0.setUTCDate(baseDateInput.getUTCDate() + daysUntilSunday);
        endOfWeek0.setUTCHours(23, 59, 59, 999);

        const startOfWeek1 = new Date(endOfWeek0);
        startOfWeek1.setUTCDate(endOfWeek0.getUTCDate() + 1);
        startOfWeek1.setUTCHours(0, 0, 0, 0);

        let fechaInicio;
        if (semanaInicio === 0) {
            fechaInicio = new Date(baseDateInput);
        } else {
            fechaInicio = new Date(startOfWeek1);
            fechaInicio.setUTCDate(startOfWeek1.getUTCDate() + (semanaInicio - 1) * 7);
        }

        let fechaFin;
        if (semanaFin === 0) {
            fechaFin = new Date(endOfWeek0);
        } else {
            fechaFin = new Date(startOfWeek1);
            fechaFin.setUTCDate(startOfWeek1.getUTCDate() + ((semanaFin - 1) * 7) + 6);
            fechaFin.setUTCHours(23, 59, 59, 999);
        }

        return {
            fechaInicio,
            fechaFin
        };

    } catch (e) {
        console.error(`Error al parsear rango de semanas: ${rangoSemanas}`, e);
        return {
            fechaInicio: null,
            fechaFin: null
        };
    }
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const year = parseInt(parts[2], 10);
        const fullYear = parts[2].length === 2 ? (year < 50 ? 2000 + year : 1900 + year) : year;
        const date = new Date(fullYear, parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
        return isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

function getWeekKey(date) {
    if (!date || isNaN(date.getTime())) return null;
    try {
        const year = date.getUTCFullYear();
        const firstDay = new Date(Date.UTC(year, 0, 1));
        const dayOfYear = Math.floor((date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        const weekNumber = Math.ceil(dayOfYear / 7);
        return `${year}-W${String(weekNumber).padStart(2, '0')}`;
    } catch (e) {
        return null;
    }
}

function convertirHoraAMinutos(horaString) {
    if (!horaString) return null;
    let hora = horaString.trim().replace(/[^0-9]/g, '');
    if (hora.length === 4) return parseInt(hora.substring(0, 2)) * 60 + parseInt(hora.substring(2, 4));
    if (hora.length === 3) return parseInt(hora.substring(0, 1)) * 60 + parseInt(hora.substring(1, 3));
    if (hora.length <= 2) return parseInt(hora) * 60;
    return null;
}

function extraerRangoHorario(horarioString) {
    if (!horarioString) return [null, null];
    const partes = horarioString.split(' - ');
    if (partes.length === 2) {
        return [convertirHoraAMinutos(partes[0].trim()), convertirHoraAMinutos(partes[1].trim())];
    }
    const horaInicio = convertirHoraAMinutos(horarioString);
    return horaInicio !== null ? [horaInicio, horaInicio + 90] : [null, null];
}

function calcularDuracionHorario(horario) {
    if (!horario || !horario.hora) return 0;
    const [inicio, fin] = extraerRangoHorario(horario.hora);
    return (inicio === null || fin === null || fin <= inicio) ? 0 : (fin - inicio) / 60;
}

function cursoEstaEnDisponibilidad(horarioCurso, horariosEspecialista, sedesPreferenciaEspecialista) {
    if (!horarioCurso || !horariosEspecialista || !sedesPreferenciaEspecialista) return false;

    const campusCursoNormalizado = normalizarString(horarioCurso.campus);
    const diaCursoNormalizado = normalizarString(horarioCurso.dia);

    const atiendeEnSede = sedesPreferenciaEspecialista.includes('TODAS') || sedesPreferenciaEspecialista.includes(campusCursoNormalizado);
    if (!atiendeEnSede) {
        return false;
    }

    const [horaInicioCurso, horaFinCurso] = extraerRangoHorario(horarioCurso.hora);
    if (horaInicioCurso === null || horaFinCurso === null) return false;

    for (const disp of horariosEspecialista) {
        if (normalizarString(disp.dia) === diaCursoNormalizado) {
            const [horaInicioDisp, horaFinDisp] = extraerRangoHorario(disp.franja);
            if (horaInicioDisp !== null && horaFinDisp !== null &&
                horaInicioCurso >= horaInicioDisp && horaFinCurso <= horaFinDisp) {
                return true;
            }
        }
    }

    return false;
}

function crearMapasDeEspecialistas(especialistasDisponibles) {
    const disponibilidadPorEspecialista = new Map();
    const limiteHorasSemanalesPorEspecialista = new Map();
    const infoEspecialistas = new Map();

    for (const registro of especialistasDisponibles) {
        const dni = String(registro.dni).trim();
        disponibilidadPorEspecialista.set(dni, registro.horarios || []);
        limiteHorasSemanalesPorEspecialista.set(dni, registro.disponibilidadHoras || 0);
        infoEspecialistas.set(dni, {
            dni,
            nombre: registro.nombre,
            antiguedad: registro.antiguedad || '',
            preferencias: {
                segmentos: (registro.segmentosPreferencia || []).map(s => normalizarString(s)),
                modalidades: (registro.modalidadPreferencia || []).map(m => normalizarString(m)),
                sedes: (registro.sedePreferencia || []).map(s => normalizarString(s)),
            },
        });
    }
    return {
        disponibilidadPorEspecialista,
        limiteHorasSemanalesPorEspecialista,
        infoEspecialistas
    };
}


// ===== FUNCIÓN PRINCIPAL =====

async function procesarMatch(semestre) {
    const fechaHoraEjecucion = new Date();
    const [docentesAProcesar, especialistasDisponibles] = await Promise.all([
        AsignacionEspecialistaDocente.find({
            semestre
        }).lean(),
        DisponibilidadAcompaniamiento.find({}).lean()
    ]);

    if (docentesAProcesar.length === 0) return {
        message: 'No se encontraron docentes para procesar.',
        matches: 0,
        sinMatch: 0
    };

    const {
        disponibilidadPorEspecialista,
        limiteHorasSemanalesPorEspecialista,
        infoEspecialistas
    } = crearMapasDeEspecialistas(especialistasDisponibles);

    const datosDeProcesamiento = {
        disponibilidadPorEspecialista,
        limiteHorasSemanalesPorEspecialista,
        infoEspecialistas,
        cargaDocentesEspecialistas: new Map(),
        cargaHorariaPorSemana: new Map(),
        todosLosEspecialistas: Array.from(infoEspecialistas.values()),
        fechaHoraEjecucion
    };

    const nuevasAsignaciones = await Promise.all(
        docentesAProcesar.map(perfil => procesarAsignacionParaDocente(perfil, datosDeProcesamiento))
    );

    await AsignacionEspecialistaDocente.deleteMany({
        semestre
    });
    if (nuevasAsignaciones.length > 0) await AsignacionEspecialistaDocente.insertMany(nuevasAsignaciones);

    const matchesCount = nuevasAsignaciones.filter(a => a.asignaciones && a.asignaciones.length > 0).length;

    return {
        message: 'Proceso de match v10.1 finalizado.',
        totalProcesados: nuevasAsignaciones.length,
        matches: matchesCount,
        sinMatch: nuevasAsignaciones.length - matchesCount,
    };
}


// ===== FUNCIÓN DE PROCESAMIENTO INDIVIDUAL =====

async function procesarAsignacionParaDocente(perfilOriginal, datos) {
    const perfil = JSON.parse(JSON.stringify(perfilOriginal));
    const {
        fechaHoraEjecucion
    } = datos;

    const asignacionesOriginales = perfil.asignaciones || [];

    const todasLasActividades = perfil.segmentos?.flatMap(s => s.actividades.map(a => ({ ...a,
        segmento: s.segmento
    }))) || [];
    const actividadesPorPeriodo = new Map();
    for (const act of todasLasActividades) {
        if (!actividadesPorPeriodo.has(act.semana)) actividadesPorPeriodo.set(act.semana, []);
        actividadesPorPeriodo.get(act.semana).push(act);
    }

    let rangoSemanasActual = null;
    let fechaInicioBusqueda = null;

    for (const rango of actividadesPorPeriodo.keys()) {
        const {
            fechaInicio,
            fechaFin
        } = getPeriodoDeSemanas(rango, perfil.semestre);
        if (fechaInicio && fechaFin && fechaHoraEjecucion >= fechaInicio && fechaHoraEjecucion <= fechaFin) {
            rangoSemanasActual = rango;
            fechaInicioBusqueda = fechaInicio;
            break;
        }
    }

    if (!rangoSemanasActual) {
        perfil.asignaciones = [];
        return perfil;
    }

    const asignacionExistenteParaPeriodoActual = asignacionesOriginales.find(asig =>
        asig.actividades.some(act => act.semana === rangoSemanasActual)
    );

    if (asignacionExistenteParaPeriodoActual) {
        perfil.asignaciones = [asignacionExistenteParaPeriodoActual];
        return perfil;
    }

    const actividadesDelPeriodo = actividadesPorPeriodo.get(rangoSemanasActual);
    // **INICIO CAMBIO v10.1**: Obtener los segmentos específicos para este período.
    const segmentosDelPeriodo = new Set(actividadesDelPeriodo.map(a => normalizarString(a.segmento)));
    if (segmentosDelPeriodo.size === 0) { // Si no hay actividades, no hay nada que asignar
        perfil.asignaciones = [];
        return perfil;
    }
    // **FIN CAMBIO v10.1**

    const especialistasExistentes = asignacionesOriginales
        .map(a => ({
            dni: a.especialistaDni,
            nombre: a.nombreEspecialista
        }))
        .filter((v, i, a) => a.findIndex(t => (t.dni === v.dni)) === i);

    let asignacionCreada = null;

    for (const esp of especialistasExistentes) {
        // **CAMBIO v10.1**: Pasar los segmentos del período a la función de búsqueda.
        const resultado = findAndAssign(perfil, perfil.cursos, perfil.modalidad, esp, fechaInicioBusqueda, segmentosDelPeriodo, datos);
        if (resultado) {
            const {
                horario
            } = resultado;
            asignacionCreada = {
                especialistaDni: esp.dni,
                nombreEspecialista: esp.nombre,
                horarioAsignado: horario,
                actividades: actividadesDelPeriodo,
                estado: "Planificado"
            };
            break;
        }
    }

    if (!asignacionCreada) {
        // **CAMBIO v10.1**: Pasar los segmentos del período a la función de búsqueda.
        const resultado = findAndAssign(perfil, perfil.cursos, perfil.modalidad, null, fechaInicioBusqueda, segmentosDelPeriodo, datos);
        if (resultado) {
            const {
                especialista,
                horario
            } = resultado;
            asignacionCreada = {
                especialistaDni: especialista.dni,
                nombreEspecialista: especialista.nombre,
                horarioAsignado: horario,
                actividades: actividadesDelPeriodo,
                estado: "Planificado"
            };
            datos.cargaDocentesEspecialistas.set(especialista.dni, (datos.cargaDocentesEspecialistas.get(especialista.dni) || 0) + 1);
        }
    }

    if (asignacionCreada) {
        perfil.asignaciones = [asignacionCreada];
    } else {
        perfil.asignaciones = [];
    }

    delete perfil.especialistaDni;
    delete perfil.nombreEspecialista;
    perfil.cursos.forEach(c => c.horarios.forEach(h => delete h.acompanamiento));

    return perfil;
}


/**
 * **REFACTORIZADO v10.1**: Encuentra y asigna un especialista compatible basándose en el nuevo modelo de preferencias
 * y en los segmentos específicos del período a asignar.
 */
function findAndAssign(perfil, cursosParaAsignar, modalidadDocente, especialistaPreferido, fechaInicioBusqueda, segmentosDelPeriodo, datos) {
    const {
        disponibilidadPorEspecialista,
        limiteHorasSemanalesPorEspecialista,
        cargaDocentesEspecialistas,
        infoEspecialistas,
        todosLosEspecialistas
    } = datos;

    const tieneHorasSemanalesDisponibles = (dni, costo, weekKey) => {
        const limite = limiteHorasSemanalesPorEspecialista.get(dni) || 0;
        const consumidas = (datos.cargaHorariaPorSemana.get(dni)?.get(weekKey) || 0);
        return (consumidas + costo) <= limite;
    };

    // --- INICIO: Lógica de filtrado de especialistas basada en preferencias ---
    const modalidadNormalizadaDocente = normalizarString(modalidadDocente);

    // 1. Determinar el pool inicial de especialistas a considerar
    let poolDeEspecialistas;
    if (especialistaPreferido) {
        poolDeEspecialistas = todosLosEspecialistas.filter(e => e.dni === especialistaPreferido.dni);
    } else {
        const dnisYaAsignados = new Set((perfil.asignaciones || []).map(a => a.especialistaDni));
        poolDeEspecialistas = todosLosEspecialistas.filter(e => !dnisYaAsignados.has(e.dni));
    }

    // 2. Filtrar el pool por compatibilidad de segmento y modalidad
    let especialistasCompatibles = poolDeEspecialistas.filter(esp => {
        const info = infoEspecialistas.get(esp.dni);
        if (!info) return false;

        // Chequeo de modalidad: ¿El especialista atiende la modalidad del docente?
        const atiendeModalidad = info.preferencias.modalidades.includes(modalidadNormalizadaDocente);
        if (!atiendeModalidad) return false;

        // **INICIO CAMBIO v10.1**: El especialista debe ser compatible con TODOS los segmentos del período.
        const atiendeTodosLosSegmentos = [...segmentosDelPeriodo].every(seg => info.preferencias.segmentos.includes(seg));
        return atiendeTodosLosSegmentos;
        // **FIN CAMBIO v10.1**
    });
    // --- FIN: Lógica de filtrado ---

    let mejorOpcion = null;
    const weekKey = getWeekKey(fechaInicioBusqueda);
    if (!weekKey) return null;

    // --- Lógica de asignación por modalidad del DOCENTE ---
    if (modalidadNormalizadaDocente.includes('PRESENCIAL') || modalidadNormalizadaDocente.includes('HIBRIDO')) {
        // --- MATCH ESTRICTO PARA PRESENCIAL ---
        let cursosDeBusqueda = cursosParaAsignar;
        if (perfil.pidd && perfil.pidd.tipoPlanIntegral?.includes('CURSO') && perfil.pidd.nombreCurso) {
            const cursosPidd = cursosParaAsignar.filter(c => c.nombreCurso === perfil.pidd.nombreCurso);
            if (cursosPidd.length > 0) cursosDeBusqueda = cursosPidd;
        }

        const horariosParaBuscar = cursosDeBusqueda.flatMap(c => c.horarios || []).filter(h => h.dia && h.hora && h.campus);
        const potencialesAsignaciones = [];

        for (const horario of horariosParaBuscar) {
            for (const esp of especialistasCompatibles) { // Iterar sobre la lista ya filtrada
                const infoEsp = infoEspecialistas.get(esp.dni);
                const horariosEsp = disponibilidadPorEspecialista.get(esp.dni);

                if (infoEsp && horariosEsp && cursoEstaEnDisponibilidad(horario, horariosEsp, infoEsp.preferencias.sedes)) {
                    const costo = calcularDuracionHorario(horario);
                    if (tieneHorasSemanalesDisponibles(esp.dni, costo, weekKey)) {
                        potencialesAsignaciones.push({
                            especialista: esp,
                            horario: { ...horario },
                            costo,
                            carga: cargaDocentesEspecialistas.get(esp.dni) || 0
                        });
                    }
                }
            }
        }

        if (potencialesAsignaciones.length > 0) {
            potencialesAsignaciones.sort((a, b) => a.carga - b.carga); // Asignar al de menor carga
            mejorOpcion = potencialesAsignaciones[0];
        }
    } else {
        // --- MATCH FLEXIBLE PARA OTRAS MODALIDADES (SÍNCRONO, VIRTUAL, TESIS) ---
        const costoActividadFlexible = 1.5;

        const especialistasOrdenados = especialistasCompatibles.sort((a, b) => (cargaDocentesEspecialistas.get(a.dni) || 0) - (cargaDocentesEspecialistas.get(b.dni) || 0));

        for (const esp of especialistasOrdenados) {
            if (tieneHorasSemanalesDisponibles(esp.dni, costoActividadFlexible, weekKey)) {
                let campusAsignado = 'A COORDINAR';
                if (modalidadNormalizadaDocente.includes('TESIS')) campusAsignado = 'TESIS';
                else if (modalidadNormalizadaDocente.includes('VIRTUAL')) campusAsignado = 'VIRTUAL ASINCRONO';
                else if (modalidadNormalizadaDocente.includes('SINC')) campusAsignado = 'VIRTUAL SINCRONO';

                mejorOpcion = {
                    especialista: esp,
                    horario: {
                        dia: 'A COORDINAR',
                        hora: 'N/A',
                        campus: campusAsignado
                    },
                    costo: costoActividadFlexible
                };
                break;
            }
        }

        if (!mejorOpcion && modalidadNormalizadaDocente.includes('SINC')) {
            const especialistasPresencialesFallback = poolDeEspecialistas.filter(esp => {
                const info = infoEspecialistas.get(esp.dni);
                if (!info) return false;
                const atiendeModalidadPresencial = info.preferencias.modalidades.includes('PRESENCIAL');
                // **CAMBIO v10.1**: Usar el filtro estricto también para el fallback.
                const atiendeTodosLosSegmentos = [...segmentosDelPeriodo].every(seg => info.preferencias.segmentos.includes(seg));
                return atiendeModalidadPresencial && atiendeTodosLosSegmentos;
            }).sort((a, b) => (cargaDocentesEspecialistas.get(a.dni) || 0) - (cargaDocentesEspecialistas.get(b.dni) || 0));

            for (const esp of especialistasPresencialesFallback) {
                if (tieneHorasSemanalesDisponibles(esp.dni, costoActividadFlexible, weekKey)) {
                    mejorOpcion = {
                        especialista: esp,
                        horario: {
                            dia: 'A COORDINAR',
                            hora: 'N/A',
                            campus: 'PRESENCIAL (FALLBACK)'
                        },
                        costo: costoActividadFlexible
                    };
                    break;
                }
            }
        }
    }

    if (mejorOpcion && mejorOpcion.costo > 0 && weekKey) {
        const {
            especialista,
            costo
        } = mejorOpcion;
        if (!datos.cargaHorariaPorSemana.has(especialista.dni)) {
            datos.cargaHorariaPorSemana.set(especialista.dni, new Map());
        }
        const cargaSemanal = datos.cargaHorariaPorSemana.get(especialista.dni);
        cargaSemanal.set(weekKey, (cargaSemanal.get(weekKey) || 0) + costo);
    }

    if (!mejorOpcion && especialistaPreferido) {
        // **CAMBIO v10.1**: Pasar los segmentos del período en la llamada recursiva.
        return findAndAssign(perfil, cursosParaAsignar, modalidadDocente, null, fechaInicioBusqueda, segmentosDelPeriodo, datos);
    }

    return mejorOpcion;
}


// ===== ENDPOINTS =====

router.post('/', async (req, res) => {
    const {
        semestre
    } = req.body;
    if (!semestre || !/^\d{4}-\d$/.test(semestre)) {
        return res.status(400).json({
            message: 'El parámetro semestre es requerido y debe tener el formato "YYYY-N".'
        });
    }
    try {
        const resultado = await procesarMatch(semestre);
        res.status(201).json(resultado);
    } catch (error) {
        console.error('Error al crear la asignación:', error);
        res.status(500).json({
            message: 'Error interno del servidor.',
            error: error.message
        });
    }
});

router.get('/', async (req, res) => {
    try {
        const {
            semestre,
            idDocente,
            especialistaDni,
            tieneAsignacion
        } = req.query;
        const query = {};

        if (semestre) query.semestre = semestre;
        if (idDocente) query.idDocente = idDocente;
        if (especialistaDni) query['asignaciones.especialistaDni'] = especialistaDni;

        if (tieneAsignacion !== undefined) {
            const existsAndNotEmpty = {
                $exists: true,
                $ne: []
            };
            query.asignaciones = (tieneAsignacion === 'true') ? existsAndNotEmpty : {
                $eq: []
            };
        }


        const data = await AsignacionEspecialistaDocente.find(query).sort({
            'docente': 1
        }).lean();
        res.json({
            data,
            totalDocs: data.length
        });
    } catch (err) {
        res.status(500).json({
            message: "Error al obtener las asignaciones: " + err.message
        });
    }
});

router.get('/exportar-excel', async (req, res) => {
    try {
        const {
            semestre
        } = req.query;
        const query = semestre ? {
            semestre
        } : {};
        const asignacionesDocentes = await AsignacionEspecialistaDocente.find(query).sort({
            'docente': 1
        }).lean();

        const workbook = new exceljs.Workbook();
        const headerStyle = {
            font: {
                bold: true,
                color: {
                    argb: 'FFFFFFFF'
                }
            },
            fill: {
                type: 'pattern',
                pattern: 'solid',
                fgColor: {
                    argb: 'FF002060'
                }
            }
        };

        const worksheet = workbook.addWorksheet('Reporte Detallado');
        worksheet.columns = [{
            header: 'Semestre',
            key: 'semestre',
            width: 12
        }, {
            header: 'ID Docente',
            key: 'idDocente',
            width: 15
        }, {
            header: 'Nombre Docente',
            key: 'docente',
            width: 35
        }, {
            header: 'Rol Colaborador',
            key: 'rolColaborador',
            width: 40
        }, {
            header: 'Facultad',
            key: 'facultad',
            width: 25
        }, {
            header: 'Programa',
            key: 'programa',
            width: 15
        }, {
            header: 'Modalidad Docente',
            key: 'modalidad',
            width: 18
        }, {
            header: 'Sede Principal Docente',
            key: 'sedePrincipal',
            width: 20
        }, {
            header: 'Campus Docente',
            key: 'campusDocente',
            width: 25
        }, {
            header: 'Promedio ESA',
            key: 'promedioEsa',
            width: 15
        }, {
            header: 'Actividades Programadas (Total)',
            key: 'actividadesProgramadas',
            width: 60
        }, {
            header: 'DNI Especialista',
            key: 'dniEspecialista',
            width: 20
        }, {
            header: 'Nombre Especialista',
            key: 'nombreEspecialista',
            width: 35
        }, {
            header: 'Horario Asignado',
            key: 'horario',
            width: 30
        }, {
            header: 'Campus Asignado',
            key: 'campus',
            width: 15
        }, {
            header: 'Actividades con este Especialista',
            key: 'actividadesAsignadas',
            width: 50
        }, {
            header: 'Todos los NRCs',
            key: 'nrcs',
            width: 40
        }, {
            header: 'Cursos y Ciclos',
            key: 'cursosCiclos',
            width: 60
        }, {
            header: 'Motivo de Inclusión',
            key: 'motivo',
            width: 40
        }, ];
        worksheet.getRow(1).font = headerStyle.font;
        worksheet.getRow(1).fill = headerStyle.fill;

        const docentesPorEspecialista = new Map();
        const actividadesPorEspecialista = new Map();
        const infoEspecialistas = new Map();

        for (const perfil of asignacionesDocentes) {
            const actividadesProgramadasTexto = (perfil.segmentos || []).flatMap(s => s.actividades.map(a => `${a.actividad} (${s.segmento} S${a.semana})`)).join('; ');
            const nrcs = (perfil.cursos || []).map(c => c.nrc).join(', ');
            const cursosCiclos = (perfil.cursos || []).map(c => `${c.nombreCurso} (${c.supermalla?.ciclo || 'N/A'})`).join('; ');
            let motivo = 'N/A';
            if (perfil.pidd) motivo = `PIDD: ${perfil.pidd.tipoPlanIntegral || 'No especificado'}`;
            else if (perfil.segmentos?.length > 0) motivo = `Segmentos: ${perfil.segmentos.map(s => s.segmento).join(', ')}`;

            const campusDocenteSet = new Set();
            (perfil.cursos || []).forEach(curso => {
                (curso.horarios || []).forEach(horario => {
                    if (horario.campus) {
                        campusDocenteSet.add(horario.campus);
                    }
                });
            });
            const campusDocenteTexto = Array.from(campusDocenteSet).join(', ');

            if (!perfil.asignaciones || perfil.asignaciones.length === 0) {
                worksheet.addRow({
                    semestre: perfil.semestre,
                    idDocente: perfil.idDocente,
                    docente: perfil.docente,
                    rolColaborador: perfil.RolColaborador,
                    facultad: perfil.facultad || 'N/A',
                    programa: perfil.programa,
                    modalidad: perfil.modalidad,
                    sedePrincipal: perfil.rud?.sedeDictado || 'N/A',
                    campusDocente: campusDocenteTexto,
                    promedioEsa: perfil.promedioEsa,
                    actividadesProgramadas: actividadesProgramadasTexto,
                    dniEspecialista: 'No Asignado',
                    nrcs,
                    cursosCiclos,
                    motivo
                });
                continue;
            }

            for (const asignacion of perfil.asignaciones) {
                const dni = asignacion.especialistaDni;
                const nombre = asignacion.nombreEspecialista;

                if (!infoEspecialistas.has(dni)) infoEspecialistas.set(dni, nombre);
                if (!docentesPorEspecialista.has(dni)) docentesPorEspecialista.set(dni, new Set());
                docentesPorEspecialista.get(dni).add(perfil.idDocente);

                const numActividades = (asignacion.actividades || []).length;
                actividadesPorEspecialista.set(dni, (actividadesPorEspecialista.get(dni) || 0) + numActividades);

                const actividadesAsignadasTexto = (asignacion.actividades || []).map(a => `${a.actividad} (S${a.semana})`).join('; ');

                worksheet.addRow({
                    semestre: perfil.semestre,
                    idDocente: perfil.idDocente,
                    docente: perfil.docente,
                    rolColaborador: perfil.RolColaborador,
                    facultad: perfil.facultad || 'N/A',
                    programa: perfil.programa,
                    modalidad: perfil.modalidad,
                    sedePrincipal: perfil.rud?.sedeDictado || 'N/A',
                    campusDocente: campusDocenteTexto,
                    promedioEsa: perfil.promedioEsa,
                    actividadesProgramadas: actividadesProgramadasTexto,
                    dniEspecialista: dni,
                    nombreEspecialista: nombre,
                    horario: asignacion.horarioAsignado ? `${asignacion.horarioAsignado.dia} ${asignacion.horarioAsignado.hora}` : 'N/A',
                    campus: asignacion.horarioAsignado?.campus || 'N/A',
                    actividadesAsignadas: actividadesAsignadasTexto,
                    nrcs,
                    cursosCiclos,
                    motivo,
                });
            }
        }

        const resumenDocentesSheet = workbook.addWorksheet('Resumen por Especialista');
        resumenDocentesSheet.columns = [{
            header: 'DNI Especialista',
            key: 'dni',
            width: 20
        }, {
            header: 'Nombre Especialista',
            key: 'nombre',
            width: 40
        }, {
            header: 'Cantidad de Docentes Asignados',
            key: 'cantidad',
            width: 30
        }, ];
        resumenDocentesSheet.getRow(1).font = headerStyle.font;
        resumenDocentesSheet.getRow(1).fill = headerStyle.fill;
        for (const [dni, setDeDocentes] of docentesPorEspecialista.entries()) {
            resumenDocentesSheet.addRow({
                dni,
                nombre: infoEspecialistas.get(dni) || 'N/A',
                cantidad: setDeDocentes.size
            });
        }

        const resumenActividadesSheet = workbook.addWorksheet('Resumen de Actividades');
        resumenActividadesSheet.columns = [{
            header: 'DNI Especialista',
            key: 'dni',
            width: 20
        }, {
            header: 'Nombre Especialista',
            key: 'nombre',
            width: 40
        }, {
            header: 'Total de Actividades Asignadas',
            key: 'cantidad',
            width: 35
        }, ];
        resumenActividadesSheet.getRow(1).font = headerStyle.font;
        resumenActividadesSheet.getRow(1).fill = headerStyle.fill;
        for (const [dni, cantidad] of actividadesPorEspecialista.entries()) {
            resumenActividadesSheet.addRow({
                dni,
                nombre: infoEspecialistas.get(dni) || 'N/A',
                cantidad
            });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Reporte_Asignaciones_${semestre || 'todos'}_${Date.now()}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('Error al exportar a Excel:', err);
        res.status(500).json({
            message: 'Error al exportar a Excel',
            error: err.message
        });
    }
});

router.get('/estadisticas', async (req, res) => {
    try {
        const {
            semestre
        } = req.query;
        const query = semestre ? {
            semestre
        } : {};

        const [asignaciones, especialistasActivos] = await Promise.all([
            AsignacionEspecialistaDocente.find(query).lean(),
            AsignacionEspecialistaDocente.aggregate([{
                $match: query
            }, {
                $unwind: '$asignaciones'
            }, {
                $group: {
                    _id: '$asignaciones.especialistaDni',
                    nombreEspecialista: {
                        $first: '$asignaciones.nombreEspecialista'
                    },
                    totalDocentes: {
                        $addToSet: '$idDocente'
                    }
                }
            }, {
                $project: {
                    nombreEspecialista: 1,
                    totalDocentes: {
                        $size: '$totalDocentes'
                    }
                }
            }, {
                $sort: {
                    totalDocentes: -1
                }
            }
            ])
        ]);

        const conAsignacion = asignaciones.filter(a => a.asignaciones && a.asignaciones.length > 0).length;
        const estadisticas = {
            totalDocentes: asignaciones.length,
            conAsignacion,
            sinAsignacion: asignaciones.length - conAsignacion,
            porcentajeConAsignacion: asignaciones.length > 0 ? ((conAsignacion / asignaciones.length) * 100).toFixed(2) : 0,
            totalEspecialistasActivos: especialistasActivos.length,
            cargaPromedioPorEspecialista: especialistasActivos.length > 0 ? (conAsignacion / especialistasActivos.length).toFixed(2) : 0,
            top5EspecialistasMasDocentes: especialistasActivos.slice(0, 5)
        };

        res.json({
            semestre: semestre || 'todos',
            estadisticas,
            fechaConsulta: new Date()
        });
    } catch (err) {
        res.status(500).json({
            message: 'Error al obtener estadísticas',
            error: err.message
        });
    }
});

module.exports = router;
