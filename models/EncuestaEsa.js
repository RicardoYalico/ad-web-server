// models/EncuestaEsa.js
const mongoose = require('mongoose');

const EncuestaEsaSchema = new mongoose.Schema({
    // _id es generado automáticamente por MongoDB
  semestre: { type: String, trim: true, default: '' },
  fechaCarga: { type: String, trim: true, default: '' },
  grupoDocente: { type: String, trim: true, default: '' },
  tipoDeEncuesta: { type: String, trim: true, default: '' },
  modalidad: { type: String, trim: true, default: '' },
  programa: { type: String, trim: true, default: '' },
  modulo: { type: String, trim: true, default: '' },
  campus: { type: String, trim: true, default: '' },
  codBanner: { type: String, trim: true, default: '' },
  codPayroll: { type: String, trim: true, default: '' },
  dni: { type: String, trim: true, default: '' /* Consider adding index: true if frequently queried */ },
  nombreDocente: { type: String, trim: true, default: '' },
  totalMatriculados: { type: Number, default: 0 },
  totalEncuestados: { type: Number, default: 0 },
  porcentajeCobertura: { type: String, default: '0%' }, // e.g., "75.5%" for 75.5%
  preguntaNps: { type: Number, default: null }, // Score for the NPS question itself
  preguntaContribAprendizaje: { type: Number, default: null }, // Score for this question
  promedioEsa: { type: Number, default: null }, // Overall ESA average
  escala: { type: String, trim: true, default: '' }, // e.g., "0-10", "1-5"
  nDetractoresNps: { type: Number, default: 0 },
  nNeutrosNps: { type: Number, default: 0 },
  nPromotoresNps: { type: Number, default: 0 },
  promedioNps: { type: Number, default: null }, // Calculated NPS score (e.g., (Promoters - Detractors) / Total * 100)
  ranking: { type: String, trim: true, default: '' }, // Could be Number if it's always numeric
  // You might want to add a reference to the Docente model or a specific course/period
  // periodoAcademico: { type: String, trim: true, default: '' },
  // nrcCurso: { type: String, trim: true, default: '' },
}, {
  timestamps: true, // Adds createdAt and updatedAt timestamps
});

// Example of a compound index if a combination should be unique
// EncuestaEsaSchema.index({ dni: 1, periodoAcademico: 1, nrcCurso: 1 }, { unique: true });

module.exports = mongoose.model('EncuestaEsa', EncuestaEsaSchema);