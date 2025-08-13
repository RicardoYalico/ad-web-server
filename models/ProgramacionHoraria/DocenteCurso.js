const mongoose = require('mongoose');

// Definición del Schema para 'docentes_cursos'
const docenteCursoSchema = new mongoose.Schema({
    seccion: String,
    nrc: String,
    nombreCurso: String,
    codCurso: String,
    periodo: String,
    metEdu: String,
    idDocente: String,
    programa: String,
    modalidad: String,
    semestre: String,
    fechaHoraEjecucion: Date
}, { collection: 'docentes_cursos', versionKey: false });

// Se exporta el modelo
module.exports = mongoose.model('DocenteCurso', docenteCursoSchema);
