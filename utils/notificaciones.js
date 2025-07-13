const NotificacionEspecialista = require('../models/Notificaciones/NotificacionEspecialista');

/**
 * Genera notificaciones para los especialistas basadas en los cambios del historial
 * @param {Array} historialRegistros - Array de registros del historial recién creados
 * @returns {Promise<Array>} Array de notificaciones creadas
 */
async function generarNotificacionesParaEspecialistas(historialRegistros) {
    console.log(`Generando notificaciones para ${historialRegistros.length} registros del historial...`);
    
    const notificacionesACrear = [];
    
    for (const registro of historialRegistros) {
        const notificacionesDelRegistro = [];
        
        // Determinar qué notificaciones generar según el tipo de cambio
        switch (registro.estadoCambio) {
            case 'ASIGNACION_NUEVA':
                if (registro.especialistaDni) {
                    notificacionesDelRegistro.push({
                        historialId: registro._id,
                        especialistaDni: registro.especialistaDni,
                        nombreEspecialista: registro.nombreEspecialista,
                        tipoNotificacion: 'NUEVA_ASIGNACION',
                        detallesCambio: {
                            semestre: registro.semestre,
                            idDocente: registro.idDocente,
                            nombreDocente: registro.docente,
                            estadoCambio: registro.estadoCambio,
                            fechaHoraEjecucion: registro.fechaHoraEjecucion,
                            especialistaAnterior: {
                                dni: null,
                                nombre: null
                            }
                        }
                    });
                }
                break;
                
            case 'REASIGNADO':
                // Notificación para el especialista que GANÓ la asignación
                if (registro.especialistaDni) {
                    notificacionesDelRegistro.push({
                        historialId: registro._id,
                        especialistaDni: registro.especialistaDni,
                        nombreEspecialista: registro.nombreEspecialista,
                        tipoNotificacion: 'REASIGNACION_GANADA',
                        detallesCambio: {
                            semestre: registro.semestre,
                            idDocente: registro.idDocente,
                            nombreDocente: registro.docente,
                            estadoCambio: registro.estadoCambio,
                            fechaHoraEjecucion: registro.fechaHoraEjecucion,
                            especialistaAnterior: {
                                dni: registro.detalleAnterior.especialistaDni,
                                nombre: registro.detalleAnterior.nombreEspecialista
                            }
                        }
                    });
                }
                
                // Notificación para el especialista que PERDIÓ la asignación
                if (registro.detalleAnterior?.especialistaDni) {
                    notificacionesDelRegistro.push({
                        historialId: registro._id,
                        especialistaDni: registro.detalleAnterior.especialistaDni,
                        nombreEspecialista: registro.detalleAnterior.nombreEspecialista,
                        tipoNotificacion: 'REASIGNACION_PERDIDA',
                        detallesCambio: {
                            semestre: registro.semestre,
                            idDocente: registro.idDocente,
                            nombreDocente: registro.docente,
                            estadoCambio: registro.estadoCambio,
                            fechaHoraEjecucion: registro.fechaHoraEjecucion,
                            especialistaAnterior: {
                                dni: registro.detalleAnterior.especialistaDni,
                                nombre: registro.detalleAnterior.nombreEspecialista
                            }
                        }
                    });
                }
                break;
                
            case 'DESASIGNADO':
                if (registro.detalleAnterior?.especialistaDni) {
                    notificacionesDelRegistro.push({
                        historialId: registro._id,
                        especialistaDni: registro.detalleAnterior.especialistaDni,
                        nombreEspecialista: registro.detalleAnterior.nombreEspecialista,
                        tipoNotificacion: 'DESASIGNACION',
                        detallesCambio: {
                            semestre: registro.semestre,
                            idDocente: registro.idDocente,
                            nombreDocente: registro.docente,
                            estadoCambio: registro.estadoCambio,
                            fechaHoraEjecucion: registro.fechaHoraEjecucion,
                            especialistaAnterior: {
                                dni: registro.detalleAnterior.especialistaDni,
                                nombre: registro.detalleAnterior.nombreEspecialista
                            }
                        }
                    });
                }
                break;
                
            // Para 'MANTENIDO' y 'PERMANECE_SIN_ASIGNAR' normalmente no se generan notificaciones
            // pero podrías agregarlas si es necesario para tu lógica de negocio
        }
        
        notificacionesACrear.push(...notificacionesDelRegistro);
    }
    
    // Insertar todas las notificaciones
    if (notificacionesACrear.length > 0) {
        const notificacionesCreadas = await NotificacionEspecialista.insertMany(notificacionesACrear);
        console.log(`${notificacionesCreadas.length} notificaciones creadas exitosamente.`);
        
        // Resumen por tipo
        const resumenPorTipo = notificacionesCreadas.reduce((acc, notif) => {
            acc[notif.tipoNotificacion] = (acc[notif.tipoNotificacion] || 0) + 1;
            return acc;
        }, {});
        console.log('Resumen de notificaciones por tipo:', resumenPorTipo);
        
        return notificacionesCreadas;
    }
    
    return [];
}

module.exports = { generarNotificacionesParaEspecialistas };