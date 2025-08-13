const mongoose = require('mongoose');

const InduccionDocenteSchema = new mongoose.Schema({
  semestre: { type: String, trim: true, default: '' },
  fechaCarga: { type: String, trim: true, default: '' },
  dni: { type: String, trim: true},
  idDocente: { type: String, trim: true },
  nivel: { type: String, trim: true },
  tipo_dictado: { type: String, trim: true },          // TIPO DE DICTADO
  primer_nombre: { type: String, trim: true },         // PRIMER NOMBRE
  segundo_nombre: { type: String, trim: true },        // SEGUNDO NOMBRE
  apellido_paterno: { type: String, trim: true },      // APELLIDO PATERNO
  apellido_materno: { type: String, trim: true },      // APELLIDO MATERNO
  telefono_contacto: { type: String, trim: true },     // TELEFONO DE CONTACTO
  correo_contacto: { type: String, trim: true },       // CORREO ELECTRONICO DE CONTACTO
  cargo_ingreso: { type: String, trim: true },         // CARGO DE INGRESO
  sede_ingreso: { type: String, trim: true },          // SEDE DE INGRESO
  facultad: { type: String, trim: true },
  carrera_departamento: { type: String, trim: true },  // CARRERA / DEPARTAMENTO
  jefe_inmediato: { type: String, trim: true },        // JEFE INMEDIATO
  fecha_incorporacion: { type: Date },                 // Fecha Incorporación
  periodo_2024_1: { type: String, trim: true },        // 2024-1
  periodo_2024_2: { type: String, trim: true },        // 2024-2
  periodo_2025_1: { type: String, trim: true },        // 2025-1
  grupo_modalidad_induccion: { type: String, trim: true }, // Grupo por modalidad Inducción
  criterio_induccion_25_2: { type: String, trim: true }    // Criterio Inducción 25-2
}, { 
  timestamps: true
  // Si los nombres en tu BD son exactamente como los encabezados originales,
  // puedes especificar el nombre exacto de la colección:
  // collection: 'nombre_exacto_de_tu_coleccion_en_mongodb' 
});

// Índices para optimizar búsquedas comunes
InduccionDocenteSchema.index({ dni: 1 }); // DNI único
InduccionDocenteSchema.index({ correo_contacto: 1 });
InduccionDocenteSchema.index({ facultad: 1 });
InduccionDocenteSchema.index({ sede_ingreso: 1 });

module.exports = mongoose.model('InduccionDocente', InduccionDocenteSchema);