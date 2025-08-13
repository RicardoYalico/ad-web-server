// models/EncuestaEsa.js
const mongoose = require('mongoose');

const SegmentacionSchema = new mongoose.Schema({
    // _id es generado automáticamente por MongoDB
  nombre: { type: String, trim: true, default: '' },
  actividad: { type: String, trim: true, default: '' },
  promedioMinimo: { type: Number, default: 0 },
  promedioMaximo: { type: Number, default: 0 },
  }, {
  timestamps: true, // Adds createdAt and updatedAt timestamps
});

module.exports = mongoose.model('Segmentacion', SegmentacionSchema);
