// models/EncuestaEsa.js
const mongoose = require('mongoose');

const ActividadesSchema = new mongoose.Schema({
    // _id es generado automáticamente por MongoDB
  actividad: { type: Object, required: true },
  }, {
    timestamps: true, 
  });

module.exports = mongoose.model('Actividades', ActividadesSchema);