// Nuevo modelo: HistorialCambiosEspecialista.js
const mongoose = require('mongoose');

const CambioHorarioSchema = new mongoose.Schema({
    seccion: String,
    codCurso: String,
    nombreCurso: String,
    dia: String,
    hora: String,
    edificio: String,
    aula: String,
    campus: String,
    accion: {
        type: String,
        enum: ['AGREGADO', 'REMOVIDO', 'MODIFICADO']
    }
}, { _id: false });

const HistorialCambiosEspecialistaSchema = new mongoose.Schema({
    // Identificación del especialista
    especialistaDni: { type: String, required: true, index: true },
    nombreEspecialista: { type: String, required: true },
    
    // Información del docente afectado
    idDocente: { type: String, required: true },
    nombreDocente: String,
    programa: String,
    modalidad: String,
    
    // Tipo de cambio
    tipoCambio: {
        type: String,
        enum: ['DOCENTE_NUEVO', 'DOCENTE_RETIRADO', 'DOCENTE_REASIGNADO_DESDE', 'DOCENTE_REASIGNADO_HACIA', 'HORARIOS_MODIFICADOS'],
        required: true
    },
    
    // Contexto del cambio
    semestre: { type: String, required: true },
    fechaHoraEjecucion: { type: Date, required: true },
    
    // Detalles específicos según el tipo de cambio
    detalles: {
        // Para reasignaciones
        especialistaAnterior: {
            dni: String,
            nombre: String
        },
        especialistaNuevo: {
            dni: String,
            nombre: String
        },
        
        // Para cambios de horarios
        horariosModificados: [CambioHorarioSchema],
        
        // Resumen del cambio
        resumen: String
    },
    
    
    // Estado del cambio (para notificaciones)
    notificado: { type: Boolean, default: false },
    fechaNotificacion: Date,
    eliminada: { type: Boolean, default: false },
    fechaEliminacion: Date
}, {
    timestamps: true
});

// Índices para consultas eficientes
HistorialCambiosEspecialistaSchema.index({ especialistaDni: 1, fechaHoraEjecucion: -1 });
HistorialCambiosEspecialistaSchema.index({ semestre: 1, fechaHoraEjecucion: -1 });
HistorialCambiosEspecialistaSchema.index({ notificado: 1 });

module.exports = mongoose.model('HistorialCambiosEspecialista', HistorialCambiosEspecialistaSchema);