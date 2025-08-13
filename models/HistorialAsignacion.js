const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * @description Schema para registrar el historial de cambios en las asignaciones de especialistas a docentes.
 * Cada documento en esta colección es un "snapshot" de una asignación en un punto específico del tiempo (una ejecución del match),
 * enriquecido con metadatos sobre el cambio ocurrido.
 */
const HistorialAsignacionSchema = new Schema({
    // --- Datos de la Asignación (Snapshot en el momento del cambio) ---
    semestre: { 
        type: String, 
        required: true, 
        index: true 
    },
    idDocente: { 
        type: String, 
        required: true, 
        index: true 
    },
    docente: { 
        type: String 
    },
    codigoDocente: { 
        type: String 
    },
    especialistaDni: { 
        type: String, 
        index: true, 
        default: null // Será null si el docente queda sin asignar o es eliminado.
    },
    nombreEspecialista: { 
        type: String, 
        default: null 
    },
    cursos: { 
        type: Array,
        default: [] // Será array vacío para docentes eliminados
    },
    pidd: {
        type: Object,
        required: false
    },
    
    // --- Metadatos del Cambio (ÚNICO ESTADO) ---
    estadoCambio: {
        type: String,
        required: true,
        enum: [
            'ASIGNACION_NUEVA',         // Docente no tenía especialista y ahora sí.
            'REASIGNADO',              // Docente tenía un especialista y se le asignó uno diferente.
            'MANTENIDO',               // Docente conserva el mismo especialista que en la ejecución anterior.
            'DESASIGNADO',             // Docente tenía especialista y ahora no tiene (o fue eliminado).
            'PERMANECE_SIN_ASIGNAR'    // Docente no tenía especialista y sigue sin tener.
        ],
        index: true
    },
    
    // Referencia a la ejecución del proceso de match que generó este registro.
    fechaHoraEjecucion: { 
        type: Date, 
        required: true, 
        index: true 
    },
    
    // --- Datos de Auditoría ---
    detalleAnterior: {
        especialistaDni: { type: String },
        nombreEspecialista: { type: String }
    }
}, {
    timestamps: true,
    collection: 'historial_asignaciones_especialistas'
});

// Middleware para asegurar que detalleAnterior no sea null
HistorialAsignacionSchema.pre('save', function(next) {
    if (this.detalleAnterior === null || this.detalleAnterior === undefined) {
        this.detalleAnterior = { especialistaDni: null, nombreEspecialista: null };
    }
    next();
});

// Método virtual para calcular el estado general cuando se necesite
HistorialAsignacionSchema.virtual('estadoGeneral').get(function() {
    return this.especialistaDni ? 'Planificado' : 'Sin Asignar';
});

// Asegurar que los virtuales se incluyan en JSON
HistorialAsignacionSchema.set('toJSON', { virtuals: true });
HistorialAsignacionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('HistorialAsignacion', HistorialAsignacionSchema);