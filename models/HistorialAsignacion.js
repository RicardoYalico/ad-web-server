const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * @description Schema para registrar el historial de cambios en las asignaciones de especialistas a docentes.
 * Cada documento en esta colección es un "snapshot" de una asignación en un punto específico del tiempo (una ejecución del match),
 * enriquecido con metadatos sobre el cambio ocurrido.
 */
const HistorialAsignacionSchema = new Schema({
    // --- Datos de la Asignación (Snapshot en el momento del cambio) ---
    // Estos campos son una copia de la asignación generada.
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
        default: null // Será null si el docente queda sin asignar.
    },
    nombreEspecialista: { 
        type: String, 
        default: null 
    },
    cursos: { 
        type: Array 
    },
    estadoGeneral: { 
        type: String, 
        required: true // Por ej: 'Planificado', 'Sin Asignar'
    },
    // --- CURSOS CON HORARIOS ENRIQUECIDOS ---
  pidd: {
        type: Object, // o mongoose.Schema.Types.Mixed
        required: false // O true, dependiendo de tus reglas de negocio
    },
    // --- Metadatos del Cambio ---
    // Este campo es el corazón del historial, describe qué pasó.
    estadoCambio: {
        type: String,
        required: true,
        enum: [
            'ASIGNACION_NUEVA',   // Docente no tenía especialista y ahora sí.
            'REASIGNADO',         // Docente tenía un especialista y se le asignó uno diferente.
            'MANTENIDO',          // Docente conserva el mismo especialista que en la ejecución anterior.
            'DESASIGNADO',        // Docente tenía especialista y ahora no tiene (estado 'Sin Asignar').
            'PERMANECE_SIN_ASIGNAR' // Docente no tenía especialista y sigue sin tener.
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
    // Guarda la información del especialista previo para facilitar comparaciones y análisis.
    detalleAnterior: {
        especialistaDni: { type: String },
        nombreEspecialista: { type: String }
    }
}, {
    timestamps: true, // Agrega los campos createdAt y updatedAt automáticamente.
    collection: 'historial_asignaciones_especialistas' // Nombre explícito de la colección en MongoDB.
});

// Middleware para asegurar que detalleAnterior no sea null
HistorialAsignacionSchema.pre('save', function(next) {
    if (this.detalleAnterior === null || this.detalleAnterior === undefined) {
        this.detalleAnterior = { especialistaDni: null, nombreEspecialista: null };
    }
    next();
});


module.exports = mongoose.model('HistorialAsignacion', HistorialAsignacionSchema);
