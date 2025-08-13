// models/DisponibilidadAcompaniamiento.js
const mongoose = require('mongoose');

const DisponibilidadAcompaniamientoSchema = new mongoose.Schema({
  nombre: { type: String, trim: true },
  dni: { type: String, trim: true },
  antiguedad: {type: String, trim: true},
  segmentosPreferencia: { type: Array, default: [] },
  modalidadPreferencia: { type: Array, default: [] },
  sedePreferencia: { type: Array, default: [] },
  disponibilidadHoras: { type: Number, default: 0 },

  // Arrays de disponibilidad
  horarios: [{
    dia: { type: String, trim: true, default: '' },
    franja: { type: String, trim: true, default: '' },
  }],
 
}, {
  timestamps: true,
});

module.exports = mongoose.model('DisponibilidadAcompaniamiento', DisponibilidadAcompaniamientoSchema);
