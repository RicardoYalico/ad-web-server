const mongoose = require('mongoose');

const SuperMallaSchema = new mongoose.Schema({
  facultad: { type: String, trim: true, default: '' },
  unidNegocio: { type: String, trim: true, default: '' },
  modaliadDeLaCarrera: { type: String, trim: true, default: '' },
  malla: { type: String, trim: true, default: '' },
  carerra: { type: String, trim: true, default: '' },
  ciclo: { type: String, trim: true, default: '' },
  codigoOficial: { type: String, trim: true, default: '' },
  curso: { type: String, trim: true, default: '' },
  categoriaDelCurso: { type: String, trim: true, default: '' },
  tipoDeEstudios: { type: String, trim: true, default: '' },
  modalidadCurso: { type: String, trim: true, default: '' },
  tipoDeCurso: { type: String, trim: true, default: '' },
}, {
  timestamps: true,
});

module.exports = mongoose.model('SuperMalla', SuperMallaSchema);
