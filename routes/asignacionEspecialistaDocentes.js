const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AsignacionEspecialistaDocente = require('../models/AsignacionEspecialistaDocente');
const Asignacion = require('../models/Asignaciones');
const DisponibilidadAcompaniamiento = require('../models/DisponibilidadAcompaniamiento');
const HistorialAsignacion = require('../models/HistorialAsignacion');

// La función procesarMatch y prepararDocumentoFinal permanecen sin cambios...
async function procesarMatch(semestre) {
    console.log(`Iniciando match para el semestre: ${semestre}`);
    const fechaHoraEjecucion = new Date(); // Fecha única para toda la ejecución.

    // 1. Obtener la fecha de la última ejecución de asignaciones de origen.
    const ultimaEjecucionOrigen = await Asignacion.findOne({ semestre: semestre })
        .sort({ fechaHoraEjecucion: -1 })
        .select('fechaHoraEjecucion')
        .lean();

    if (!ultimaEjecucionOrigen) {
        throw new Error(`No se encontraron asignaciones de origen para el semestre ${semestre}.`);
    }
    const fechaMasReciente = ultimaEjecucionOrigen.fechaHoraEjecucion;
    console.log(`Se usará la data de asignaciones de la fecha: ${fechaMasReciente}`);

    // 2. Obtener todos los datos necesarios en paralelo.
    const [docentesParaAsignar, especialistasDisponibles, asignacionesAnteriores] = await Promise.all([
        Asignacion.find({ semestre: semestre, fechaHoraEjecucion: fechaMasReciente }).lean(),
        DisponibilidadAcompaniamiento.find({}).lean(),
        AsignacionEspecialistaDocente.find({ semestre: semestre }).sort({ fechaHoraEjecucion: -1 }).lean()
    ]);

    if (docentesParaAsignar.length === 0) {
        return { message: 'No se encontraron docentes para procesar.', matches: 0, sinMatch: 0 };
    }
    console.log(`Docentes a procesar: ${docentesParaAsignar.length}, Especialistas disponibles: ${especialistasDisponibles.length}`);

    // 3. Crear mapa de disponibilidad de especialistas para búsquedas O(1).
    const disponibilidadMap = new Map();
    for (const especialista of especialistasDisponibles) {
        const key = `${especialista.dia}-${especialista.sede1DePreferenciaPresencial}-${especialista.franja}`;
        const dniAsString = String(especialista.dni).trim();
        if (!disponibilidadMap.has(key)) {
            disponibilidadMap.set(key, []);
        }
        disponibilidadMap.get(key).push({
            dni: dniAsString,
            nombre: especialista.apellidosNombresCompletos,
            disponibilidad: { dia: especialista.dia, franja: especialista.franja, sede: especialista.sede1DePreferenciaPresencial, turno: especialista.turno, hora: especialista.hora }
        });
    }

    // 4. Crear mapa con la asignación MÁS RECIENTE de cada docente.
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

    // 5. Procesamiento y generación de historial.
    const resultadosDelMatch = [];
    const historialAGuardar = [];
    
    // --- BUCLE PRINCIPAL DE PROCESAMIENTO ---
    for (const docente of docentesParaAsignar) {
        const especialistaPrevio = mapaAsignacionPrevia.get(docente.idDocente);
        let infoDelEspecialistaAsignado = null;
        let estadoCambio = '';
        
        // FASE 1: Intentar mantener al especialista previo si tenía uno.
        if (especialistaPrevio && especialistaPrevio.estadoGeneral === 'Planificado') {
            for (const curso of docente.cursos) {
                for (const horario of curso.horarios) {
                    const key = `${horario.dia}-${horario.campus}-${horario.hora}`;
                    const especialistasEnHorario = disponibilidadMap.get(key);
                    if (especialistasEnHorario?.some(e => e.dni === especialistaPrevio.dni)) {
                        infoDelEspecialistaAsignado = { dni: especialistaPrevio.dni, nombre: especialistaPrevio.nombre };
                        estadoCambio = 'MANTENIDO';
                        console.log(`MATCH MANTENIDO: Docente [${docente.docente}] mantiene a [${infoDelEspecialistaAsignado.nombre}]`);
                        break;
                    }
                }
                if (infoDelEspecialistaAsignado) break;
            }
        }
        
        // FASE 2: Si no se pudo mantener, buscar cualquier especialista disponible.
        if (!infoDelEspecialistaAsignado) {
            for (const curso of docente.cursos) {
                for (const horario of curso.horarios) {
                    const key = `${horario.dia}-${horario.campus}-${horario.hora}`;
                    if (disponibilidadMap.has(key)) {
                        infoDelEspecialistaAsignado = disponibilidadMap.get(key)[0]; // Tomar el primero disponible
                        break;
                    }
                }
                if (infoDelEspecialistaAsignado) break;
            }
        }

        // --- DETERMINAR ESTADO DEL CAMBIO Y PREPARAR DOCUMENTOS ---
        let documentoFinal;
        const detalleAnterior = {
            especialistaDni: especialistaPrevio?.dni || null,
            nombreEspecialista: especialistaPrevio?.nombre || null
        };

        if (infoDelEspecialistaAsignado) {
            documentoFinal = prepararDocumentoFinal(docente, infoDelEspecialistaAsignado, disponibilidadMap, semestre);
            if (estadoCambio === 'MANTENIDO') { /* Ya está definido */ }
            else if (especialistaPrevio?.estadoGeneral === 'Planificado') { estadoCambio = 'REASIGNADO'; console.warn(`CAMBIO: Docente [${docente.docente}] de [${especialistaPrevio.nombre}] a [${infoDelEspecialistaAsignado.nombre}]`); }
            else { estadoCambio = 'ASIGNACION_NUEVA'; console.log(`NUEVO MATCH: Docente [${docente.docente}] a [${infoDelEspecialistaAsignado.nombre}]`); }
        } else {
            documentoFinal = { ...docente, especialistaDni: null, nombreEspecialista: null, cursos: docente.cursos, semestre: semestre, estadoGeneral: 'Sin Asignar' };
            delete documentoFinal._id; delete documentoFinal.fechaHoraEjecucion;
            if (especialistaPrevio?.estadoGeneral === 'Planificado') { estadoCambio = 'DESASIGNADO'; console.warn(`DESASIGNADO: Docente [${docente.docente}]`); }
            else { estadoCambio = 'PERMANECE_SIN_ASIGNAR'; console.log(`SIN MATCH: Docente [${docente.docente}]`); }
        }
        
        resultadosDelMatch.push({ ...documentoFinal, fechaHoraEjecucion });
        historialAGuardar.push({ ...documentoFinal, estadoCambio, fechaHoraEjecucion, detalleAnterior });
    }

    // 6. Guardar los resultados en ambas colecciones.
    if (resultadosDelMatch.length > 0) {
        const matchesCount = resultadosDelMatch.filter(r => r.estadoGeneral === 'Planificado').length;
        console.log(`\nResumen: ${matchesCount} con match, ${resultadosDelMatch.length - matchesCount} sin match.`);

        // --- INICIO DE MODIFICACIÓN ---
        // Filtrar el historial para guardar únicamente los docentes que fueron reasignados.
        const historialDeReasignados = historialAGuardar.filter(h => h.estadoCambio === 'REASIGNADO');
        console.log(`Registrando ${historialDeReasignados.length} docentes reasignados en el historial.`);

        // Preparar las operaciones de guardado.
        const promises = [
            AsignacionEspecialistaDocente.insertMany(resultadosDelMatch) // Siempre se guarda el estado completo actual.
        ];

        // Solo se guarda en el historial si hubo al menos una reasignación.
        if (historialDeReasignados.length > 0) {
            promises.push(HistorialAsignacion.insertMany(historialDeReasignados));
        }
        // --- FIN DE MODIFICACIÓN ---

        await Promise.all(promises);
        
        console.log('Resultados de la ejecución y historial de reasignaciones guardados exitosamente.');
        return { message: 'Proceso de match finalizado.', totalProcesados: resultadosDelMatch.length, matches: matchesCount, sinMatch: resultadosDelMatch.length - matchesCount };
    } else {
        return { message: 'Proceso finalizado, no se generaron documentos.', totalProcesados: 0, matches: 0, sinMatch: 0 };
    }
}
function prepararDocumentoFinal(docente, infoEspecialista, disponibilidadMap, semestre) {
    const cursosConMatch = JSON.parse(JSON.stringify(docente.cursos));
    for (const curso of cursosConMatch) {
        for (const horario of curso.horarios) {
            const key = `${horario.dia}-${horario.campus}-${horario.hora}`;
            const especialistasEnHorario = disponibilidadMap.get(key);
            if (especialistasEnHorario?.some(e => e.dni === infoEspecialista.dni)) {
                 horario.acompanamiento = {
                    especialistaDni: infoEspecialista.dni,
                    nombreEspecialista: infoEspecialista.nombre,
                    estado: "Planificado",
                    disponibilidadEspecialista: especialistasEnHorario.find(e => e.dni === infoEspecialista.dni).disponibilidad
                };
            }
        }
    }
    const documentoFinal = { ...docente, especialistaDni: infoEspecialista.dni, nombreEspecialista: infoEspecialista.nombre, cursos: cursosConMatch, semestre: semestre, estadoGeneral: 'Planificado' };
    delete documentoFinal._id; delete documentoFinal.fechaHoraEjecucion;
    return documentoFinal;
}


// --- RUTAS DE LA API ---

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
            const ultimaEjecucion = await AsignacionEspecialistaDocente.findOne(query)
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
        const resultado = await procesarMatch(semestre);
        res.status(201).json(resultado);
    } catch (error) {
        console.error('Error al crear la asignación:', error);
        res.status(500).json({ message: 'Error interno del servidor.', error: error.message });
    }
});

module.exports = router;
