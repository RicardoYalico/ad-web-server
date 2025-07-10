const mongoose = require('mongoose');

const AsignacionCambioSchema = new mongoose.Schema({
    semestre: { type: String, required: true, index: true },
    fechaDeteccion: { type: Date, required: true },
    tipoCambio: { type: String, required: true, enum: ['NUEVO', 'MODIFICADO', 'ELIMINADO'] },
    idDocente: { type: String, required: true, index: true },
    docente: { type: String, default: '' },
    
    // Solo para tipo 'MODIFICADO'
    cambios: { type: Object },

    // Solo para tipo 'NUEVO'
    asignacionNueva: { type: Object },

    // Solo para tipo 'ELIMINADO'
    asignacionAnterior: { type: Object }
}, {
    timestamps: true,
    minimize: false // Asegura que se guarden objetos vacíos en 'cambios' si es necesario
});

module.exports = mongoose.model('AsignacionCambio', AsignacionCambioSchema, 'asignacion_cambios');
