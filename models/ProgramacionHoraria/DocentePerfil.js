const mongoose = require('mongoose');

// Definición del Schema para 'docentes_perfiles'
const docentePerfilSchema = new mongoose.Schema({
    idDocente: String,
    docente: String,
    RolColaborador: String,
    programa: String,
    modalidad: String,
    promedioEsa: Number,
    pidd: Object,
    semestre: String,
    fechaHoraEjecucion: Date
}, { collection: 'docentes_perfiles', versionKey: false });

// Se exporta el modelo para que pueda ser utilizado en otras partes de la aplicación.
module.exports = mongoose.model('DocentePerfil', docentePerfilSchema);
