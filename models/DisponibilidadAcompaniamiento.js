// models/DisponibilidadAcompaniamiento.js
const mongoose = require('mongoose');

const DisponibilidadAcompaniamientoSchema = new mongoose.Schema({
  apellidosNombresCompletos: { type: String, trim: true, required: [true, 'Los apellidos y nombres son requeridos'] },
  dni: { type: String, trim: true, required: [true, 'El DNI es requerido'] /* index: true */ },
  horasDisponiblesParaRealizarAcompaniamientoPresencial: { type: Number, default: 0 },
  horasDisponiblesParaRealizarAcompaniamientoRemoto: { type: Number, default: 0 },
  sede1DePreferenciaPresencial: { type: String, trim: true, default: '' },
  dia: { type: String, trim: true, default: '' }, // Ej: LUNES, MARTES
  franja: { type: String, trim: true, default: '' }, // Ej: "0730 - 0900"
  hora: { type: String, trim: true, default: '' }, // Ej: MAÑANA, TARDE, NOCHE
  turno: { type: String, trim: true, default: '' }, // M, T, N (Mañana, Tarde, Noche)
  // Considera añadir un campo para el periodo académico si es relevante
  // periodoAcademico: { type: String, trim: true },
}, {
  timestamps: true,
});

// Para evitar duplicados exactos de la misma disponibilidad horaria para el mismo DNI y sede/dia/franja
// Esto es un ejemplo, ajústalo a la unicidad real que necesites.
DisponibilidadAcompaniamientoSchema.index(
  { dni: 1, sede1DePreferenciaPresencial: 1, dia: 1, franja: 1, turno: 1 /* , periodoAcademico: 1 */ },
  { unique: true, message: 'Ya existe una disponibilidad registrada con estos mismos datos para el DNI.' }
);


module.exports = mongoose.model('DisponibilidadAcompaniamiento', DisponibilidadAcompaniamientoSchema);