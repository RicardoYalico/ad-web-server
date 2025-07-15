// ===============================
// 3. ARCHIVO COMPLETO OPTIMIZADO: routes/asignacionEspecialistaDocentes.js
// ===============================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- MODELOS ---
const { generarNotificacionesParaEspecialistas } = require('../utils/notificaciones');
const AsignacionEspecialistaDocente = require('../models/AsignacionEspecialistaDocente');
const HistorialAsignacion = require('../models/HistorialAsignacion');
const DisponibilidadAcompaniamiento = require('../models/DisponibilidadAcompaniamiento');
const DocentePerfil = require('../models/ProgramacionHoraria/DocentePerfil');
const DocenteCurso = require('../models/ProgramacionHoraria/DocenteCurso');
const CursoHorario = require('../models/ProgramacionHoraria/CursoHorario');

// ===== FUNCIONES AUXILIARES OPTIMIZADAS =====

function convertirHoraAMinutos(horaString) {
    if (!horaString) return null;
    
    let hora = horaString.trim().replace(/[^0-9]/g, '');
    
    if (hora.length === 4) {
        const horas = parseInt(hora.substring(0, 2));
        const minutos = parseInt(hora.substring(2, 4));
        return horas * 60 + minutos;
    }
    
    if (hora.length === 3) {
        const horas = parseInt(hora.substring(0, 1));
        const minutos = parseInt(hora.substring(1, 3));
        return horas * 60 + minutos;
    }
    
    if (hora.length <= 2) {
        const horas = parseInt(hora);
        return horas * 60;
    }
    
    return null;
}

function extraerRangoHorario(horarioString) {
    if (!horarioString) return [null, null];
    
    const partes = horarioString.split(' - ');
    
    if (partes.length === 2) {
        const inicio = convertirHoraAMinutos(partes[0].trim());
        const fin = convertirHoraAMinutos(partes[1].trim());
        return [inicio, fin];
    }
    
    const horaInicio = convertirHoraAMinutos(horarioString);
    if (horaInicio !== null) {
        return [horaInicio, horaInicio + 90];
    }
    
    return [null, null];
}

function cursoEstaEnDisponibilidad(horarioCurso, disponibilidadEspecialista) {
    if (horarioCurso.dia !== disponibilidadEspecialista.dia) {
        return false;
    }
    
    if (horarioCurso.campus && disponibilidadEspecialista.sede1DePreferenciaPresencial) {
        if (horarioCurso.campus !== disponibilidadEspecialista.sede1DePreferenciaPresencial) {
            return false;
        }
    }
    
    const [horaInicioCurso, horaFinCurso] = extraerRangoHorario(horarioCurso.hora);
    const [horaInicioDisp, horaFinDisp] = extraerRangoHorario(disponibilidadEspecialista.franja);
    
    if (horaInicioCurso === null || horaFinCurso === null || horaInicioDisp === null || horaFinDisp === null) {
        return false;
    }
    
    return horaInicioCurso >= horaInicioDisp && horaFinCurso <= horaFinDisp;
}

// ✅ FUNCIÓN OPTIMIZADA: Verificación de disponibilidad
function puedeEspecialistaAcompañarDocenteOptimizado(especialistaDni, horariosParaBuscar, disponibilidadPorEspecialista) {
    const disponibilidadesEspecialista = disponibilidadPorEspecialista.get(especialistaDni);
    
    if (!disponibilidadesEspecialista || disponibilidadesEspecialista.length === 0) {
        return false;
    }
    
    // Crear mapa de disponibilidades para acceso rápido O(1)
    const disponibilidadMap = new Map();
    for (const disp of disponibilidadesEspecialista) {
        const key = `${disp.dia}-${disp.sede1DePreferenciaPresencial}`;
        if (!disponibilidadMap.has(key)) {
            disponibilidadMap.set(key, []);
        }
        disponibilidadMap.get(key).push(disp);
    }
    
    // Verificar si puede cubrir al menos un horario
    for (const horario of horariosParaBuscar) {
        const key = `${horario.dia}-${horario.campus}`;
        const disponibilidadesParaEsteHorario = disponibilidadMap.get(key);
        
        if (disponibilidadesParaEsteHorario) {
            for (const disp of disponibilidadesParaEsteHorario) {
                if (cursoEstaEnDisponibilidad(horario, disp)) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

// ===== FUNCIÓN PRINCIPAL COMPLETAMENTE OPTIMIZADA =====

async function procesarMatchOptimizado(semestre) {
    console.log(`🚀 Iniciando match OPTIMIZADO para el semestre: ${semestre}`);
    const tiempoInicio = Date.now();
    const fechaHoraEjecucion = new Date();
    
    try {
        // 1. CAPTURAR ESTADO ACTUAL CON PROYECCIÓN MÍNIMA
        console.log('📊 Capturando estado actual...');
        const asignacionesActualesAntesDelMatch = await AsignacionEspecialistaDocente
            .find(
                { semestre }, 
                { 
                    idDocente: 1, 
                    especialistaDni: 1, 
                    nombreEspecialista: 1, 
                    docente: 1, 
                    codigoDocente: 1, 
                    pidd: 1 
                }
            )
            .lean();
        
        console.log(`✅ ${asignacionesActualesAntesDelMatch.length} asignaciones actuales encontradas`);
        
        // 2. OBTENER FECHA MÁS RECIENTE DE FORMA OPTIMIZADA
        const ultimaEjecucionOrigen = await DocentePerfil.findOne(
            { semestre: semestre },
            { fechaHoraEjecucion: 1 }
        )
        .sort({ fechaHoraEjecucion: -1 })
        .lean();
        
        if (!ultimaEjecucionOrigen) {
            throw new Error(`No se encontraron perfiles de origen para el semestre ${semestre}.`);
        }
        
        const fechaMasReciente = ultimaEjecucionOrigen.fechaHoraEjecucion;
        console.log(`📅 Usando data de fecha: ${fechaMasReciente}`);
        
        // 3. CARGA PARALELA DE DATOS CON PROYECCIÓN ESPECÍFICA
        console.log('🔄 Cargando datos en paralelo...');
        const [
            perfilesDocentes,
            cursosDocentes,
            horariosCursos,
            especialistasDisponibles
        ] = await Promise.all([
            DocentePerfil.find(
                { semestre: semestre, fechaHoraEjecucion: fechaMasReciente },
                { 
                    idDocente: 1, 
                    docente: 1, 
                    codigoDocente: 1,
                    programa: 1, 
                    modalidad: 1, 
                    promedioEsa: 1, 
                    pidd: 1,
                    RolColaborador: 1
                }
            ).lean(),
            
            DocenteCurso.find(
                { semestre: semestre, fechaHoraEjecucion: fechaMasReciente },
                { 
                    seccion: 1, 
                    idDocente: 1, 
                    nombreCurso: 1, 
                    codCurso: 1, 
                    programa: 1, 
                    modalidad: 1,
                    nrc: 1,
                    periodo: 1,
                    metEdu: 1
                }
            ).lean(),
            
            CursoHorario.find(
                { semestre: semestre, fechaHoraEjecucion: fechaMasReciente },
                { 
                    seccion: 1, 
                    dia: 1, 
                    hora: 1, 
                    campus: 1,
                    turno: 1,
                    edificio: 1,
                    aula: 1,
                    fechaInicio: 1,
                    fechaFin: 1
                }
            ).lean(),
            
            DisponibilidadAcompaniamiento.find(
                {},
                { 
                    dni: 1, 
                    apellidosNombresCompletos: 1, 
                    dia: 1, 
                    franja: 1, 
                    sede1DePreferenciaPresencial: 1,
                    horasDisponiblesParaRealizarAcompaniamientoPresencial: 1,
                    horasDisponiblesParaRealizarAcompaniamientoRemoto: 1
                }
            ).lean()
        ]);
        
        if (perfilesDocentes.length === 0) {
            return { 
                message: 'No se encontraron perfiles de docentes para procesar.', 
                matches: 0, 
                sinMatch: 0,
                tiempoEjecucion: Date.now() - tiempoInicio
            };
        }
        
        console.log(`📈 Datos cargados: ${perfilesDocentes.length} perfiles, ${cursosDocentes.length} cursos, ${horariosCursos.length} horarios, ${especialistasDisponibles.length} especialistas`);
        
        // 4. CREAR MAPAS OPTIMIZADOS DE UNA SOLA VEZ
        console.log('🗺️ Creando mapas optimizados...');
        
        // Mapa de asignaciones previas
        const mapaAsignacionPrevia = new Map(
            asignacionesActualesAntesDelMatch.map(a => [
                a.idDocente, 
                {
                    dni: a.especialistaDni,
                    nombre: a.nombreEspecialista,
                    tieneAsignacion: !!a.especialistaDni,
                    docente: a.docente,
                    codigoDocente: a.codigoDocente,
                    pidd: a.pidd
                }
            ])
        );
        
        // Mapas de disponibilidad optimizados
        const disponibilidadPorEspecialista = new Map();
        const especialistasREM = new Map();
        const especialistasVIR = new Map();
        const cargaEspecialistas = new Map();
        
        for (const especialista of especialistasDisponibles) {
            const dniAsString = String(especialista.dni).trim();
            
            if (!disponibilidadPorEspecialista.has(dniAsString)) {
                disponibilidadPorEspecialista.set(dniAsString, []);
                cargaEspecialistas.set(dniAsString, 0);
            }
            disponibilidadPorEspecialista.get(dniAsString).push(especialista);
            
            const especialistaInfo = { 
                dni: dniAsString, 
                nombre: especialista.apellidosNombresCompletos 
            };
            
            if (especialista.sede1DePreferenciaPresencial === 'REM') {
                especialistasREM.set(dniAsString, especialistaInfo);
            } else if (especialista.sede1DePreferenciaPresencial === 'VIR') {
                especialistasVIR.set(dniAsString, especialistaInfo);
            }
        }
        
        // Mapas de cursos y horarios optimizados
        const horariosPorSeccionMap = new Map();
        for (const horario of horariosCursos) {
            if (!horariosPorSeccionMap.has(horario.seccion)) {
                horariosPorSeccionMap.set(horario.seccion, []);
            }
            horariosPorSeccionMap.get(horario.seccion).push(horario);
        }
        
        const cursosMap = new Map(cursosDocentes.map(curso => [curso.seccion, curso]));
        
        // Mapas por docente para evitar filtros repetidos
        const cursosPorDocenteMap = new Map();
        const seccionesPorDocenteMap = new Map();
        
        for (const curso of cursosDocentes) {
            if (!cursosPorDocenteMap.has(curso.idDocente)) {
                cursosPorDocenteMap.set(curso.idDocente, []);
                seccionesPorDocenteMap.set(curso.idDocente, new Set());
            }
            cursosPorDocenteMap.get(curso.idDocente).push(curso);
            seccionesPorDocenteMap.get(curso.idDocente).add(curso.seccion);
        }
        
        console.log('✅ Mapas creados exitosamente');
        
        // 5. DETECTAR DOCENTES ELIMINADOS
        const docentesEnNuevaProgramacion = new Set(perfilesDocentes.map(p => p.idDocente));
        const docentesEliminados = [...mapaAsignacionPrevia.keys()].filter(idDocente => 
            !docentesEnNuevaProgramacion.has(idDocente)
        );
        
        console.log(`🗑️ Docentes eliminados: ${docentesEliminados.length}`);
        
        // 6. SEPARACIÓN OPTIMIZADA POR PIDD
        const docentesPrioritarios = [];
        const docentesRegulares = [];
        
        for (const perfil of perfilesDocentes) {
            const tienePiddEspecifico = perfil.pidd && 
                (perfil.pidd.tipoPlanIntegral === 'ESA POR CURSO' || 
                 perfil.pidd.tipoPlanIntegral === 'ESA POR CURSO-GENERAL') && 
                perfil.pidd.codCurso;
            
            if (tienePiddEspecifico) {
                docentesPrioritarios.push(perfil);
            } else {
                docentesRegulares.push(perfil);
            }
        }
        
        console.log(`🎯 Docentes PIDD específico: ${docentesPrioritarios.length}, Regulares: ${docentesRegulares.length}`);
        
        // 7. PROCESAMIENTO EN LOTES OPTIMIZADO
        const nuevasAsignaciones = [];
        const historialAGuardar = [];
        
        console.log('🔄 Procesando docentes prioritarios...');
        await procesarDocentesEnLotes(
            docentesPrioritarios,
            'PRIORITARIO',
            cursosPorDocenteMap,
            seccionesPorDocenteMap,
            horariosPorSeccionMap,
            cursosMap,
            mapaAsignacionPrevia,
            disponibilidadPorEspecialista,
            especialistasREM,
            especialistasVIR,
            cargaEspecialistas,
            nuevasAsignaciones,
            historialAGuardar,
            semestre
        );
        
        console.log('🔄 Procesando docentes regulares...');
        await procesarDocentesEnLotes(
            docentesRegulares,
            'REGULAR',
            cursosPorDocenteMap,
            seccionesPorDocenteMap,
            horariosPorSeccionMap,
            cursosMap,
            mapaAsignacionPrevia,
            disponibilidadPorEspecialista,
            especialistasREM,
            especialistasVIR,
            cargaEspecialistas,
            nuevasAsignaciones,
            historialAGuardar,
            semestre
        );
        
        // 8. PROCESAR DOCENTES ELIMINADOS
        for (const idDocenteEliminado of docentesEliminados) {
            const asignacionPrevia = mapaAsignacionPrevia.get(idDocenteEliminado);
            
            if (asignacionPrevia?.tieneAsignacion) {
                historialAGuardar.push({
                    semestre: semestre,
                    idDocente: idDocenteEliminado,
                    docente: asignacionPrevia.docente || `Docente ${idDocenteEliminado}`,
                    codigoDocente: asignacionPrevia.codigoDocente || idDocenteEliminado,
                    especialistaDni: null,
                    nombreEspecialista: null,
                    cursos: [],
                    pidd: asignacionPrevia.pidd || null,
                    estadoCambio: 'DESASIGNADO',
                    detalleAnterior: {
                        especialistaDni: asignacionPrevia.dni,
                        nombreEspecialista: asignacionPrevia.nombre
                    }
                });
            }
        }
        
        // 9. GUARDAR RESULTADOS SIN TRANSACCIÓN (Compatible con MongoDB standalone)
        console.log('💾 Guardando resultados...');
        
        try {
            // Eliminar estado anterior
            const deleteResult = await AsignacionEspecialistaDocente.deleteMany({ semestre });
            console.log(`🗑️ Estado anterior eliminado: ${deleteResult.deletedCount} registros`);
            
            // Insertar nuevo estado en lotes
            if (nuevasAsignaciones.length > 0) {
                const nuevasAsignacionesConFecha = nuevasAsignaciones.map(asignacion => ({
                    ...asignacion,
                    fechaHoraEjecucion
                }));
                
                // Insertar en lotes de 1000
                const tamanoLote = 1000;
                for (let i = 0; i < nuevasAsignacionesConFecha.length; i += tamanoLote) {
                    const lote = nuevasAsignacionesConFecha.slice(i, i + tamanoLote);
                    try {
                        await AsignacionEspecialistaDocente.insertMany(lote, { 
                            ordered: false,
                            writeConcern: { w: 1 } // Escritura rápida
                        });
                        console.log(`📦 Lote ${Math.floor(i/tamanoLote) + 1} insertado: ${lote.length} registros`);
                    } catch (insertError) {
                        console.error(`❌ Error insertando lote ${Math.floor(i/tamanoLote) + 1}:`, insertError.message);
                        // Continúar con el siguiente lote
                    }
                }
                console.log(`✅ Total insertado: ${nuevasAsignaciones.length} asignaciones`);
            }
            
            // Guardar historial en lotes
            if (historialAGuardar.length > 0) {
                const historialConFecha = historialAGuardar.map(h => ({
                    ...h, 
                    fechaHoraEjecucion
                }));
                
                const tamanoLoteHistorial = 1000;
                for (let i = 0; i < historialConFecha.length; i += tamanoLoteHistorial) {
                    const lote = historialConFecha.slice(i, i + tamanoLoteHistorial);
                    try {
                        await HistorialAsignacion.insertMany(lote, { 
                            ordered: false,
                            writeConcern: { w: 1 }
                        });
                    } catch (historialError) {
                        console.error(`❌ Error insertando historial lote ${Math.floor(i/tamanoLoteHistorial) + 1}:`, historialError.message);
                    }
                }
                console.log(`📝 Historial guardado: ${historialAGuardar.length} registros`);
            }
            
        } catch (saveError) {
            console.error('❌ Error durante el guardado:', saveError);
            throw new Error(`Error guardando resultados: ${saveError.message}`);
        }
        
        // 10. GENERAR NOTIFICACIONES ASÍNCRONAMENTE (CORREGIDO)
        if (historialAGuardar.length > 0) {
            // No bloquear la respuesta con las notificaciones
            setImmediate(async () => {
                try {
                    // Obtener los registros del historial con sus IDs generados
                    const historialConIds = await HistorialAsignacion.find({
                        semestre: semestre,
                        fechaHoraEjecucion: fechaHoraEjecucion
                    }).lean();
                    
                    console.log(`🔔 Generando notificaciones para ${historialConIds.length} registros del historial...`);
                    
                    // Filtrar solo los registros que necesitan notificación
                    const registrosParaNotificar = historialConIds.filter(h => 
                        h.especialistaDni && 
                        ['ASIGNACION_NUEVA', 'REASIGNADO', 'DESASIGNADO'].includes(h.estadoCambio)
                    );
                    
                    if (registrosParaNotificar.length > 0) {
                        const notificacionesCreadas = await generarNotificacionesParaEspecialistas(registrosParaNotificar);
                        console.log(`✅ ${notificacionesCreadas.length} notificaciones generadas para especialistas`);
                    } else {
                        console.log(`ℹ️ No hay registros que requieran notificación`);
                    }
                } catch (notifError) {
                    console.error('❌ Error al generar notificaciones:', notifError.message);
                    // No lanzar error para que no afecte el proceso principal
                }
            });
        }
        
        // 11. RESULTADO FINAL
        const matchesCount = nuevasAsignaciones.filter(a => a.especialistaDni !== null).length;
        const sinMatchCount = nuevasAsignaciones.length - matchesCount;
        const tiempoTotal = Date.now() - tiempoInicio;
        
        console.log(`\n🎉 === RESUMEN FINAL ===`);
        console.log(`✅ Docentes con match: ${matchesCount}`);
        console.log(`❌ Docentes sin match: ${sinMatchCount}`);
        console.log(`📊 Total procesado: ${nuevasAsignaciones.length}`);
        console.log(`🗑️ Docentes eliminados: ${docentesEliminados.length}`);
        console.log(`⏱️ Tiempo total: ${(tiempoTotal / 1000).toFixed(2)} segundos`);
        console.log(`🚀 Velocidad: ${(nuevasAsignaciones.length / (tiempoTotal / 1000)).toFixed(0)} docentes/segundo`);
        
        return { 
            message: 'Proceso de match OPTIMIZADO finalizado.', 
            totalProcesados: nuevasAsignaciones.length, 
            matches: matchesCount, 
            sinMatch: sinMatchCount,
            eliminados: docentesEliminados.length,
            tiempoEjecucion: tiempoTotal,
            velocidad: Math.round(nuevasAsignaciones.length / (tiempoTotal / 1000)),
            resumenCambios: historialAGuardar.reduce((acc, h) => {
                acc[h.estadoCambio] = (acc[h.estadoCambio] || 0) + 1;
                return acc;
            }, {})
        };
        
    } catch (error) {
        console.error('❌ Error en procesarMatchOptimizado:', error);
        throw error;
    }
}

// ===== FUNCIÓN PARA PROCESAR EN LOTES =====

async function procesarDocentesEnLotes(
    docentes,
    tipo,
    cursosPorDocenteMap,
    seccionesPorDocenteMap,
    horariosPorSeccionMap,
    cursosMap,
    mapaAsignacionPrevia,
    disponibilidadPorEspecialista,
    especialistasREM,
    especialistasVIR,
    cargaEspecialistas,
    nuevasAsignaciones,
    historialAGuardar,
    semestre
) {
    const tamanoLote = 100; // Procesar de 100 en 100
    
    for (let i = 0; i < docentes.length; i += tamanoLote) {
        const lote = docentes.slice(i, i + tamanoLote);
        const numeroLote = Math.floor(i/tamanoLote) + 1;
        const totalLotes = Math.ceil(docentes.length/tamanoLote);
        
        console.log(`📦 Procesando lote ${numeroLote}/${totalLotes} (${lote.length} docentes ${tipo})`);
        
        // Procesar lote en paralelo con Promise.all
        const promesasLote = lote.map(perfil => 
            procesarAsignacionOptimizada(
                perfil,
                tipo,
                cursosPorDocenteMap,
                seccionesPorDocenteMap,
                horariosPorSeccionMap,
                cursosMap,
                mapaAsignacionPrevia,
                disponibilidadPorEspecialista,
                especialistasREM,
                especialistasVIR,
                cargaEspecialistas,
                semestre
            )
        );
        
        const resultadosLote = await Promise.all(promesasLote);
        
        // Agregar resultados al array principal
        for (const resultado of resultadosLote) {
            if (resultado.nuevaAsignacion) {
                nuevasAsignaciones.push(resultado.nuevaAsignacion);
            }
            if (resultado.historial) {
                historialAGuardar.push(resultado.historial);
            }
        }
        
        // Pequeña pausa para no saturar el sistema
        if (i + tamanoLote < docentes.length) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    }
}

// ===== FUNCIÓN DE ASIGNACIÓN OPTIMIZADA =====

async function procesarAsignacionOptimizada(
    perfil,
    tipo,
    cursosPorDocenteMap,
    seccionesPorDocenteMap,
    horariosPorSeccionMap,
    cursosMap,
    mapaAsignacionPrevia,
    disponibilidadPorEspecialista,
    especialistasREM,
    especialistasVIR,
    cargaEspecialistas,
    semestre
) {
    const idDocente = perfil.idDocente;
    const especialistaPrevio = mapaAsignacionPrevia.get(idDocente);
    
    let infoDelEspecialistaAsignado = null;
    let estadoCambio = '';
    
    // Obtener cursos y horarios del docente de forma optimizada
    const cursosDelDocente = cursosPorDocenteMap.get(idDocente) || [];
    let horariosParaBuscar = [];
    
    if (tipo === 'PRIORITARIO' && perfil.pidd?.codCurso) {
        // Solo cursos del PIDD específico
        const cursosEspecificos = cursosDelDocente.filter(c => c.codCurso === perfil.pidd.codCurso);
        horariosParaBuscar = cursosEspecificos.flatMap(c => 
            horariosPorSeccionMap.get(c.seccion) || []
        );
    } else {
        // Todos los cursos del programa/modalidad
        const cursosDelPerfil = cursosDelDocente.filter(c => 
            c.programa === perfil.programa && c.modalidad === perfil.modalidad
        );
        horariosParaBuscar = cursosDelPerfil.flatMap(c => 
            horariosPorSeccionMap.get(c.seccion) || []
        );
    }
    
    // Lógica de asignación según modalidad
    const esVirtualAsincrono = perfil.modalidad === 'Virtual Asíncrono';
    const esVirtualSincrono = perfil.modalidad === 'Virtual Síncrono';
    
    if (esVirtualAsincrono) {
        // Especialistas VIR - asignación automática
        if (especialistaPrevio?.tieneAsignacion && especialistasVIR.has(especialistaPrevio.dni)) {
            infoDelEspecialistaAsignado = { dni: especialistaPrevio.dni, nombre: especialistaPrevio.nombre };
            estadoCambio = 'MANTENIDO';
        } else if (especialistasVIR.size > 0) {
            const especialistasOrdenados = Array.from(especialistasVIR.values())
                .sort((a, b) => (cargaEspecialistas.get(a.dni) || 0) - (cargaEspecialistas.get(b.dni) || 0));
            infoDelEspecialistaAsignado = especialistasOrdenados[0];
            estadoCambio = especialistaPrevio?.tieneAsignacion ? 'REASIGNADO' : 'ASIGNACION_NUEVA';
        }
    } else if (esVirtualSincrono) {
        // Especialistas REM - asignación automática
        if (especialistaPrevio?.tieneAsignacion && especialistasREM.has(especialistaPrevio.dni)) {
            infoDelEspecialistaAsignado = { dni: especialistaPrevio.dni, nombre: especialistaPrevio.nombre };
            estadoCambio = 'MANTENIDO';
        } else if (especialistasREM.size > 0) {
            const especialistasOrdenados = Array.from(especialistasREM.values())
                .sort((a, b) => (cargaEspecialistas.get(a.dni) || 0) - (cargaEspecialistas.get(b.dni) || 0));
            infoDelEspecialistaAsignado = especialistasOrdenados[0];
            estadoCambio = especialistaPrevio?.tieneAsignacion ? 'REASIGNADO' : 'ASIGNACION_NUEVA';
        }
    } else {
        // Modalidad presencial/híbrida - verificar disponibilidad horaria
        if (especialistaPrevio?.tieneAsignacion) {
            const puedeMantenerse = puedeEspecialistaAcompañarDocenteOptimizado(
                especialistaPrevio.dni, 
                horariosParaBuscar, 
                disponibilidadPorEspecialista
            );
            
            if (puedeMantenerse) {
                infoDelEspecialistaAsignado = { dni: especialistaPrevio.dni, nombre: especialistaPrevio.nombre };
                estadoCambio = 'MANTENIDO';
            }
        }
        
        // Si no puede mantener o no tenía asignación, buscar nuevo especialista
        if (!infoDelEspecialistaAsignado) {
            const especialistasViables = [];
            
            // Iterar por todos los especialistas disponibles
            for (const [dni, disponibilidades] of disponibilidadPorEspecialista.entries()) {
                const puedeAcompañar = puedeEspecialistaAcompañarDocenteOptimizado(
                    dni, 
                    horariosParaBuscar, 
                    disponibilidadPorEspecialista
                );
                
                if (puedeAcompañar) {
                    especialistasViables.push({
                        dni,
                        nombre: disponibilidades[0].apellidosNombresCompletos,
                        carga: cargaEspecialistas.get(dni) || 0
                    });
                }
            }
            
            if (especialistasViables.length > 0) {
                // Ordenar por carga (menor carga primero)
                especialistasViables.sort((a, b) => a.carga - b.carga);
                infoDelEspecialistaAsignado = especialistasViables[0];
                estadoCambio = especialistaPrevio?.tieneAsignacion ? 'REASIGNADO' : 'ASIGNACION_NUEVA';
            }
        }
    }
    
    // Actualizar carga del especialista
    if (infoDelEspecialistaAsignado) {
        cargaEspecialistas.set(infoDelEspecialistaAsignado.dni, 
            (cargaEspecialistas.get(infoDelEspecialistaAsignado.dni) || 0) + 1);
    }
    
    // Crear documento de asignación optimizado
    const todosLosCursosAnidados = [];
    const seccionesDelDocente = seccionesPorDocenteMap.get(idDocente) || new Set();
    
    // Construir cursos con horarios de forma optimizada
    let primerMatchMarcado = false;
    const horariosElegibles = new Set(horariosParaBuscar.map(h => `${h.seccion}-${h.dia}-${h.hora}`));
    
    seccionesDelDocente.forEach(seccion => {
        const infoCurso = cursosMap.get(seccion);
        const horariosDelCurso = horariosPorSeccionMap.get(seccion) || [];
        
        if (infoCurso) {
            const horariosAnidados = horariosDelCurso.map(h => {
                const horarioConAcompanamiento = { ...h };
                
                if (infoDelEspecialistaAsignado) {
                    if (esVirtualSincrono || esVirtualAsincrono) {
                        // Para modalidades virtuales, marcar todos los horarios
                        const tipo = !primerMatchMarcado ? 'Recomendado' : 'Opcional';
                        horarioConAcompanamiento.acompanamiento = {
                            especialistaDni: infoDelEspecialistaAsignado.dni,
                            nombreEspecialista: infoDelEspecialistaAsignado.nombre,
                            estado: "Planificado",
                            tipo: tipo
                        };
                        if (tipo === 'Recomendado') primerMatchMarcado = true;
                    } else {
                        // Para modalidad presencial/híbrida, verificar disponibilidad específica
                        const horarioKey = `${h.seccion}-${h.dia}-${h.hora}`;
                        if (horariosElegibles.has(horarioKey)) {
                            const puedeEsteHorario = disponibilidadPorEspecialista.get(infoDelEspecialistaAsignado.dni)?.some(registro => 
                                cursoEstaEnDisponibilidad(h, registro)
                            );
                            
                            if (puedeEsteHorario) {
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
            
            todosLosCursosAnidados.push({ 
                ...infoCurso, 
                horarios: horariosAnidados 
            });
        }
    });
    
    // Determinar estado de cambio si no se asignó
    if (!infoDelEspecialistaAsignado) {
        estadoCambio = especialistaPrevio?.tieneAsignacion ? 'DESASIGNADO' : 'PERMANECE_SIN_ASIGNAR';
    }
    
    // Crear documentos finales
    const nuevaAsignacion = { 
        ...perfil,
        especialistaDni: infoDelEspecialistaAsignado?.dni || null, 
        nombreEspecialista: infoDelEspecialistaAsignado?.nombre || null, 
        cursos: todosLosCursosAnidados, 
        semestre: semestre
    };
    
    // Limpiar campos que no deben ir al nuevo estado
    delete nuevaAsignacion._id;
    delete nuevaAsignacion.fechaHoraEjecucion;
    
    const historial = { 
        ...nuevaAsignacion, 
        estadoCambio, 
        detalleAnterior: { 
            especialistaDni: especialistaPrevio?.dni || null, 
            nombreEspecialista: especialistaPrevio?.nombre || null 
        }
    };
    
    return { nuevaAsignacion, historial };
}

// ===== ENDPOINTS OPTIMIZADOS =====

// GET: Endpoint optimizado para obtener asignaciones actuales
router.get('/', async (req, res) => {
    try {
        const { semestre, idDocente, dniEspecialista, tieneAsignacion, limite = 30000, pagina = 1 } = req.query;
        const query = {};
        
        if (semestre) query.semestre = semestre;
        if (idDocente) query.idDocente = idDocente;
        if (dniEspecialista) query.especialistaDni = dniEspecialista;
        
        if (tieneAsignacion !== undefined) {
            if (tieneAsignacion === 'true') {
                query.especialistaDni = { $ne: null };
            } else if (tieneAsignacion === 'false') {
                query.especialistaDni = null;
            }
        }
        
        // Paginación para manejar grandes volúmenes
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        
        const [data, total] = await Promise.all([
            AsignacionEspecialistaDocente.find(query)
                .sort({ 'docente': 1 })
                .limit(parseInt(limite))
                .skip(skip)
                .lean(),
            AsignacionEspecialistaDocente.countDocuments(query)
        ]);
        
        // Filtrar cursos por especialista si se especifica
        if (dniEspecialista && data.length > 0) {
            data.forEach(asignacion => {
                asignacion.cursos = asignacion.cursos
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
            });
        }
        
        res.json({
            data: data,
            totalDocs: total,
            paginacion: {
                pagina: parseInt(pagina),
                limite: parseInt(limite),
                total,
                totalPaginas: Math.ceil(total / parseInt(limite))
            },
            message: `Estado actual del semestre ${semestre || 'todos'}`
        });
        
    } catch (err) {
        console.error("Error al obtener las asignaciones:", err);
        res.status(500).json({ message: "Error al obtener las asignaciones: " + err.message });
    }
});

// GET: Endpoint optimizado para obtener el historial de cambios
router.get('/historial', async (req, res) => {
    try {
        const { 
            especialistaDni, 
            estadoCambio, 
            semestre, 
            idDocente, 
            tieneAsignacion,
            fechaDesde,
            fechaHasta,
            limite = 100,
            pagina = 1
        } = req.query;
        
        const query = {};
        
        if (especialistaDni) query.especialistaDni = especialistaDni;
        
        if (estadoCambio) {
            const estados = estadoCambio.split(',').map(e => e.trim().toUpperCase());
            query.estadoCambio = { $in: estados };
        }
        
        if (semestre) query.semestre = semestre;
        if (idDocente) query.idDocente = idDocente;
        
        if (tieneAsignacion !== undefined) {
            if (tieneAsignacion === 'true') {
                query.especialistaDni = { $ne: null };
            } else if (tieneAsignacion === 'false') {
                query.especialistaDni = null;
            }
        }
        
        if (fechaDesde || fechaHasta) {
            query.fechaHoraEjecucion = {};
            if (fechaDesde) query.fechaHoraEjecucion.$gte = new Date(fechaDesde);
            if (fechaHasta) query.fechaHoraEjecucion.$lte = new Date(fechaHasta);
        }
        
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        
        const [historial, total] = await Promise.all([
            HistorialAsignacion.find(query)
                .sort({ fechaHoraEjecucion: -1, idDocente: 1 })
                .limit(parseInt(limite))
                .skip(skip)
                .lean(),
            HistorialAsignacion.countDocuments(query)
        ]);
        
        // Estadísticas optimizadas
        const resumen = historial.reduce((acc, registro) => {
            acc[registro.estadoCambio] = (acc[registro.estadoCambio] || 0) + 1;
            return acc;
        }, {});
        
        const conAsignacion = historial.filter(h => h.especialistaDni !== null).length;
        const sinAsignacion = historial.length - conAsignacion;
        
        res.json({
            data: historial,
            totalDocs: total,
            paginacion: {
                pagina: parseInt(pagina),
                limite: parseInt(limite),
                total,
                totalPaginas: Math.ceil(total / parseInt(limite))
            },
            resumen: resumen,
            estadisticas: {
                conAsignacion,
                sinAsignacion,
                totalEspecialistasUnicos: [...new Set(historial.map(h => h.especialistaDni).filter(dni => dni))].length,
                totalDocentesUnicos: [...new Set(historial.map(h => h.idDocente))].length
            },
            filtrosAplicados: {
                especialistaDni: especialistaDni || null,
                estadoCambio: estadoCambio || null,
                semestre: semestre || null,
                idDocente: idDocente || null,
                tieneAsignacion: tieneAsignacion || null,
                fechaDesde: fechaDesde || null,
                fechaHasta: fechaHasta || null
            }
        });
        
    } catch (err) {
        console.error('Error al obtener el historial de asignaciones:', err);
        res.status(500).json({ 
            message: 'Error al obtener el historial de asignaciones', 
            error: err.message 
        });
    }
});

// GET: Endpoint optimizado para estadísticas
router.get('/estadisticas', async (req, res) => {
    try {
        const { semestre } = req.query;
        const query = semestre ? { semestre } : {};
        
        // Agregaciones optimizadas en paralelo
        const [
            resumenGeneral,
            especialistasActivos,
            distribucionModalidad
        ] = await Promise.all([
            AsignacionEspecialistaDocente.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: null,
                        totalDocentes: { $sum: 1 },
                        conAsignacion: {
                            $sum: {
                                $cond: [{ $ne: ['$especialistaDni', null] }, 1, 0]
                            }
                        },
                        sinAsignacion: {
                            $sum: {
                                $cond: [{ $eq: ['$especialistaDni', null] }, 1, 0]
                            }
                        }
                    }
                }
            ]),
            
            AsignacionEspecialistaDocente.aggregate([
                { $match: { ...query, especialistaDni: { $ne: null } } },
                { 
                    $group: { 
                        _id: '$especialistaDni', 
                        nombreEspecialista: { $first: '$nombreEspecialista' },
                        totalDocentes: { $sum: 1 } 
                    } 
                },
                { $sort: { totalDocentes: -1 } },
                { $limit: 10 }
            ]),
            
            AsignacionEspecialistaDocente.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: '$modalidad',
                        total: { $sum: 1 },
                        conAsignacion: {
                            $sum: {
                                $cond: [{ $ne: ['$especialistaDni', null] }, 1, 0]
                            }
                        }
                    }
                },
                { $sort: { total: -1 } }
            ])
        ]);
        
        const estadisticas = resumenGeneral[0] || { totalDocentes: 0, conAsignacion: 0, sinAsignacion: 0 };
        
        res.json({
            semestre: semestre || 'todos',
            estadisticas: {
                ...estadisticas,
                porcentajeConAsignacion: estadisticas.totalDocentes > 0 ? 
                    ((estadisticas.conAsignacion / estadisticas.totalDocentes) * 100).toFixed(2) : 0,
                totalEspecialistas: especialistasActivos.length,
                cargaPromedioPorEspecialista: especialistasActivos.length > 0 ? 
                    (estadisticas.conAsignacion / especialistasActivos.length).toFixed(2) : 0,
                top10EspecialistasMasDocentes: especialistasActivos,
                distribucionPorModalidad: distribucionModalidad
            },
            fechaConsulta: new Date()
        });
        
    } catch (err) {
        console.error('Error al obtener estadísticas:', err);
        res.status(500).json({ 
            message: 'Error al obtener estadísticas', 
            error: err.message 
        });
    }
});

// POST: Endpoint optimizado para iniciar el proceso de match
router.post('/', async (req, res) => {
    const { semestre } = req.body;
    
    if (!semestre || !/^\d{4}-\d$/.test(semestre)) {
        return res.status(400).json({ 
            message: 'El parámetro semestre es requerido y debe tener el formato "YYYY-N".' 
        });
    }
    
    try {
        console.log(`🎯 Iniciando proceso de match optimizado para semestre: ${semestre}`);
        const resultado = await procesarMatchOptimizado(semestre);
        
        res.status(201).json({
            ...resultado,
            timestamp: new Date(),
            version: 'OPTIMIZADO_V2'
        });
        
    } catch (error) {
        console.error('❌ Error al crear la asignación:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor.', 
            error: error.message,
            timestamp: new Date()
        });
    }
});

// EXPORTAR FUNCIONES PARA TESTING
module.exports = router;
module.exports.procesarMatchOptimizado = procesarMatchOptimizado; // Para testing