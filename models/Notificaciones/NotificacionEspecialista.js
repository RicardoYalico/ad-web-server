const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * @description Schema para manejar las notificaciones de cambios para los especialistas.
 * Esta colección mantiene el estado de lectura de cada cambio del historial por especialista.
 */
const NotificacionEspecialistaSchema = new Schema({
    // Referencia al registro del historial que genera esta notificación
    historialId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HistorialAsignacion',
        required: true,
        index: true
    },
    
    // DNI del especialista que debe recibir la notificación
    especialistaDni: {
        type: String,
        required: true,
        index: true
    },
    
    // Nombre del especialista (denormalizado para performance)
    nombreEspecialista: {
        type: String,
        required: true
    },
    
    // Tipo de notificación basado en el estado de cambio
    tipoNotificacion: {
        type: String,
        required: true,
        enum: [
            'NUEVA_ASIGNACION',     // Nueva asignación al especialista
            'REASIGNACION_GANADA',  // El especialista ganó una reasignación
            'REASIGNACION_PERDIDA', // El especialista perdió una reasignación
            'DESASIGNACION'         // Se le quitó una asignación al especialista
        ],
        index: true
    },
    
    // Estado de la notificación
    estado: {
        type: String,
        required: true,
        enum: ['NO_LEIDA', 'LEIDA', 'ARCHIVADA'],
        default: 'NO_LEIDA',
        index: true
    },
    
    // Datos del cambio (denormalizados para mostrar en la notificación)
    detallesCambio: {
        semestre: { type: String, required: true },
        idDocente: { type: String, required: true },
        nombreDocente: { type: String, required: true },
        estadoCambio: { type: String, required: true },
        fechaHoraEjecucion: { type: Date, required: true },
        
        // Para reasignaciones, información del especialista anterior/nuevo
        especialistaAnterior: {
            dni: { type: String },
            nombre: { type: String }
        }
    },
    
    // Prioridad de la notificación
    prioridad: {
        type: String,
        enum: ['BAJA', 'MEDIA', 'ALTA'],
        default: 'MEDIA'
    },
    
    // Fecha cuando fue marcada como leída
    fechaLectura: {
        type: Date,
        default: null
    },
    
    // Fecha cuando fue archivada (opcional)
    fechaArchivado: {
        type: Date,
        default: null
    },
    
    // Metadatos adicionales
    metadata: {
        // Cantidad de docentes afectados en esta ejecución para este especialista
        docentesAfectadosEnEjecucion: { type: Number, default: 1 },
        
        // Si es parte de una reasignación masiva
        esReasignacionMasiva: { type: Boolean, default: false }
    }
    
}, {
    timestamps: true,
    collection: 'notificaciones_especialistas'
});

// Índices compuestos para consultas eficientes
NotificacionEspecialistaSchema.index({ especialistaDni: 1, estado: 1 });
NotificacionEspecialistaSchema.index({ especialistaDni: 1, 'detallesCambio.fechaHoraEjecucion': -1 });
NotificacionEspecialistaSchema.index({ tipoNotificacion: 1, estado: 1 });

// Middleware para establecer la prioridad automáticamente
NotificacionEspecialistaSchema.pre('save', function(next) {
    if (this.isNew) {
        // Establecer prioridad basada en el tipo de notificación
        switch (this.tipoNotificacion) {
            case 'NUEVA_ASIGNACION':
                this.prioridad = 'ALTA';
                break;
            case 'REASIGNACION_GANADA':
                this.prioridad = 'ALTA';
                break;
            case 'REASIGNACION_PERDIDA':
                this.prioridad = 'MEDIA';
                break;
            case 'DESASIGNACION':
                this.prioridad = 'ALTA';
                break;
            default:
                this.prioridad = 'MEDIA';
        }
    }
    next();
});

// Método para marcar como leída
NotificacionEspecialistaSchema.methods.marcarComoLeida = function() {
    this.estado = 'LEIDA';
    this.fechaLectura = new Date();
    return this.save();
};

// Método para archivar
NotificacionEspecialistaSchema.methods.archivar = function() {
    this.estado = 'ARCHIVADA';
    this.fechaArchivado = new Date();
    return this.save();
};

// Método estático para obtener resumen de notificaciones de un especialista
NotificacionEspecialistaSchema.statics.obtenerResumenEspecialista = async function(especialistaDni) {
    const resumen = await this.aggregate([
        { $match: { especialistaDni } },
        {
            $group: {
                _id: '$estado',
                count: { $sum: 1 }
            }
        }
    ]);
    
    return {
        noLeidas: resumen.find(r => r._id === 'NO_LEIDA')?.count || 0,
        leidas: resumen.find(r => r._id === 'LEIDA')?.count || 0,
        archivadas: resumen.find(r => r._id === 'ARCHIVADA')?.count || 0,
        total: resumen.reduce((acc, r) => acc + r.count, 0)
    };
};

module.exports = mongoose.model('NotificacionEspecialista', NotificacionEspecialistaSchema);