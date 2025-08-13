// models/PlanIntegralDocente.js
const mongoose = require('mongoose');

const PlanIntegralDocenteSchema = new mongoose.Schema({
  // Campos para la gestión de cargas y reportes (ya no son requeridos)
  semestre: { type: String, trim: true, default: '' },
  fechaCarga: { type: String, default: null },

  // Información del Docente y Contexto Académico
  campus: { type: String, trim: true, default: '' },
  facultad: { type: String, trim: true, default: '' },
  carrera: { type: String, trim: true, default: '' },
  programa: { type: String, trim: true, default: '' },
  modalidad: { type: String, trim: true, default: '' },
  payroll: { type: String, trim: true, default: '' },
  dni: { type: String, trim: true, default: '' }, // Ya no es requerido
  banner: { type: String, trim: true, default: '' },
  docente: { type: String, trim: true, default: 'Docente no especificado' },
  cargo: { type: String, trim: true, default: '' },
  correo: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },

  // Indicadores Generales
  esa: { type: Number, default: null },
  rubrica: { type: Number, default: null },
  dispersion: { type: String, trim: true, default: '' },

  // Detalles del Plan y Primer Curso
  tipoPlanIntegral: { type: String, trim: true, default: '' },
  modalidadCurso: { type: String, trim: true, default: '' },
  programaCurso: { type: String, trim: true, default: '' },
  codCurso: { type: String, trim: true, default: '' },
  nombreCurso: { type: String, trim: true, default: '' },
  esaCurso: { type: Number, default: null },
  rubricaCurso: { type: Number, default: null },
  dispersionCurso: { type: String, trim: true, default: '' },
  encuentraProgramacion: { type: String, trim: true, default: '' },

  // Campos para un Segundo Curso (Opcional)
  modalidadCurso2: { type: String, trim: true, default: '' },
  programaCurso2: { type: String, trim: true, default: '' },
  codCurso2: { type: String, trim: true, default: '' },
  nombreCurso2: { type: String, trim: true, default: '' },
  esaCurso2: { type: Number, default: null },
  rubricaCurso2: { type: Number, default: null },
  dispersionCurso2: { type: String, trim: true, default: '' },
  encuentraProgramacion2: { type: String, trim: true, default: '' },

  // Campos de Seguimiento y Gestión
  planMejora: { type: String, trim: true, default: '' },
  coordinadora: { type: String, trim: true, default: '' },
  comentarios: { type: String, trim: true, default: '' },
  respuestaDocente: { type: String, trim: true, default: '' },
  columna: { type: String, trim: true, default: '' }, // Puede ser un nombre de columna específico o estado
  estadoFinal: { type: String, trim: true, default: '' },
  asignacion: { type: String, trim: true, default: '' },

}, {
  timestamps: true, // Agrega createdAt y updatedAt automáticamente
});

// Índice para mejorar el rendimiento de las consultas de reporte y eliminación
// PlanIntegralDocenteSchema.index({ semestre: 1, fechaCarga: 1 });

module.exports = mongoose.model('PlanIntegralDocente', PlanIntegralDocenteSchema);
