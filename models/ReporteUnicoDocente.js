// models/ReporteUnicoDocente.js
const mongoose = require('mongoose');

const ReporteUnicoDocenteSchema = new mongoose.Schema({
  // _id es generado automáticamente por MongoDB
  semestre: { type: String, trim: true, default: '' },
  fechaCarga: { type: String, trim: true, default: '' },
  codigoColaborador: {
    type: String,
    trim: true,
    // unique: true, // Si debe ser único
    // required: [true, "El código de colaborador es requerido"],
    default: ''
  },
  dni: {
    type: String,
    trim: true,
    default: ''
    // Podrías añadir una validación de formato si es necesario
  },
  codigoBanner: {
    type: String,
    trim: true,
    // unique: true, // Si debe ser único
    default: ''
  },
  docente: { // Nombre completo del docente
    type: String,
    trim: true,
    default: 'Docente no especificado'
  },
  rol2025_1: { // Específico para el reporte "Rol 2025-1"
    type: String,
    trim: true,
    default: ''
  },
  horasPedagogicasM1: {
    type: Number,
    default: 0
  },
  horasPedagogicasM2: {
    type: Number,
    default: 0
  },
  alerta: {
    type: String,
    trim: true,
    default: ''
  },
  correoDocente: {
    type: String,
    trim: true,
    lowercase: true, // Guardar correos en minúscula para consistencia
    // required: [true, "El correo del docente es requerido"],
    match: [/.+\@.+\..+/, 'Por favor, ingrese un correo electrónico válido'],
    default: ''
  },
  sedeDictado: {
    type: String,
    trim: true,
    default: ''
  },
  facultad: {
    type: String,
    trim: true,
    default: ''
  },
  carrera: {
    type: String,
    trim: true,
    default: ''
  },
  responsableProgramacion: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt timestamps
});

// Evitar error de sobreescritura de modelo si ya existe (útil en entornos de desarrollo con HMR)
module.exports = mongoose.model('ReporteUnicoDocente', ReporteUnicoDocenteSchema);