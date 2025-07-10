const mongoose = require('mongoose');

const AsignacionesEsaSchema = new mongoose.Schema({
  periodo: { type: String, trim: true },
  nombreCurso: { type: String, trim: true },
  idDocente: { type: String, trim: true },
  docente: { type: String, trim: true },
  rolColaborador: { type: String, trim: true },
  programa: { type: String, trim: true },
  modalidad: { type: String, trim: true },
  promedioEsa: { type: Number, default: 0 },
  fechaHoraEjecucion: { type: Date, default: Date.now }
}, {
  timestamps: true,
});

module.exports = mongoose.models.asignaciones || mongoose.model('asignaciones', AsignacionesEsaSchema);

