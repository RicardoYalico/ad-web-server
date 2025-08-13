// models/DisponibilidadAcompaniamiento.js
const mongoose = require('mongoose');

const DisponibilidadAcompaniamientoSchema = new mongoose.Schema({
  // Campos generales (no arrays)
  apellidosNombresCompletos: { type: String, trim: true },
  dni: { type: String, trim: true },
  horasDisponiblesParaRealizarAcompaniamientoPresencial: { type: Number, default: 0 },
  
  // --- NUEVO CAMPO AÑADIDO ---
  // Columna para la antigüedad, tipo Objeto.
  // Puedes usar un objeto genérico o definir una estructura más específica como en el ejemplo comentado.
  antiguedad: {type: String, trim: true, default: ''},
  segmentos: { type: Array, default: [] },
  asumePIDDNuevos: { type: Boolean, default: false },
  modalidadAcompaniamiento: { type: Object, default: {
     modalidad: {type: String, trim: true, default: 'PRESENCIAL'},
     puedeOtros: {type: Boolean, default: true}
    }}, 

  // Arrays de disponibilidad
  disponibilidades: [{
    sede1DePreferenciaPresencial: { type: String, trim: true, default: '' },
    dia: { type: String, trim: true, default: '' }, // Ej: LUNES, MARTES
    franja: { type: String, trim: true, default: '' }, // Ej: "0730 - 0900"
    hora: { type: String, trim: true, default: '' }, // Ej: MAÑANA, TARDE, NOCHE
    turno: { type: String, trim: true, default: '' }, // M, T, N (Mañana, Tarde, Noche)
  }],
 
}, {
  timestamps: true,
});

module.exports = mongoose.model('DisponibilidadAcompaniamiento', DisponibilidadAcompaniamientoSchema);
