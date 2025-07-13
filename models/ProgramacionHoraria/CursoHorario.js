const mongoose = require('mongoose');

// Definición del Schema para 'cursos_horarios'
const cursoHorarioSchema = new mongoose.Schema({
    seccion: String,
    fechaInicio: String,
    fechaFin: String,
    dia: String,
    hora: String,
    turno: String,
    edificio: String,
    campus: String,
    aula: String,
    semestre: String,
    fechaHoraEjecucion: Date
}, { collection: 'cursos_horarios', versionKey: false });

// Se exporta el modelo
module.exports = mongoose.model('CursoHorario', cursoHorarioSchema);
