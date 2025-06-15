// models/Docente.js
const mongoose = require('mongoose');

const ProgramacionHorariaSchema = new mongoose.Schema({
  // _id es generado automáticamente por MongoDB
  semestre: { type: String, trim: true, default: '' },
  fechaProgramacion: { type: String, trim: true, default: '' },
  periodo: { type: String, trim: true, default: '' },
  campus: { type: String, trim: true, default: '' },
  facultad: { type: String, trim: true, default: '' },
  codDuenioCurso: { type: String, trim: true, default: '' },    // Antes: cod_dueno_curso
  duenioCurso: { type: String, trim: true, default: '' },       // Antes: dueno_curso
  codCurso: { type: String, trim: true, default: '' },          // Antes: cod_curso
  nombreCurso: { type: String, trim: true, default: '' },       // Antes: nombre_curso
  hrsPlanCurso: { type: Number, default: null },              // Antes: hrs_plan_curso
  nrc: { type: String, trim: true, sparse: true, default: '' },
  seccion: { type: String, trim: true, default: '' },
  estatus: { type: String, trim: true, default: '' },           // Antes: estatus_seccion (mapeado a ESTAUS -> estatus)
  lstCrz: { type: String, trim: true, default: '' },            // Antes: lst_crz
  origenLstCrz: { type: String, trim: true, default: '' },      // Antes: origen_lst_crz
  sobrepasoAula: { type: String, trim: true, default: '' },     // Antes: sobrepaso_aula
  tipHor: { type: String, trim: true, default: '' },            // Antes: tip_hor
  metEdu: { type: String, trim: true, default: '' },            // Antes: met_edu
  maximo: { type: Number, default: null },                    // Antes: maximo_alumnos (mapeado a MAXIMO -> maximo)
  real: { type: Number, default: null },                      // Antes: alumnos_reales (mapeado a REAL -> real)
  restante: { type: Number, default: null },                  // Antes: alumnos_restantes (mapeado a RESTANTE -> restante)
  hrsCredito: { type: Number, default: null },                // Antes: hrs_credito
  idDocente: { type: String, trim: true, default: '' },         // Antes: id_docente_asignado (mapeado a ID DOCENTE -> idDocente)
  idRrhh: { type: String, trim: true, default: '' },            // Antes: id_rrhh_docente (mapeado a ID RRHH -> idRrhh)
  docente: {                                                  // Antes: nombre_docente_asignado (mapeado a DOCENTE -> docente)
    type: String,
    trim: true,
    // required: [true, "El nombre del docente es un campo requerido"] // Descomentar si es obligatorio
    default: 'Docente no especificado'
  },
  idPrinc: { type: String, trim: true, default: '' },           // Antes: id_princ_docente (mapeado a ID PRINC -> idPrinc)
  tipoJornada: { type: String, trim: true, default: '' },       // Antes: tipo_jornada_docente (mapeado a TIPO JORNADA -> tipoJornada)
  estadoDocente: { type: String, trim: true, default: '' },     // Antes: estado_docente_en_curso (mapeado a ESTADO DOCENTE -> estadoDocente)
  motivo: { type: String, trim: true, default: '' },            // Antes: motivo_estado_docente (mapeado a MOTIVO -> motivo)
  fechaInicio: { type: String, default: '' },                 // Antes: fecha_inicio_curso (mapeado a FECHA INICIO -> fechaInicio)
  fechaFin: { type: String, default: '' },                    // Antes: fecha_fin_curso (mapeado a FECHA FIN -> fechaFin)
  dia: { type: String, trim: true, default: '' },               // Antes: dia_semana (mapeado a DIA -> dia)
  hora: { type: String, trim: true, default: '' },              // Antes: hora_clase (mapeado a HORA -> hora)
  turno: { type: String, trim: true, default: '' },
  edificio: { type: String, trim: true, default: '' },
  aula: { type: String, trim: true, default: '' },
  tipoAmbiente: { type: String, trim: true, default: '' },     
  inExPrograma: { type: String, trim: true, default: '' },      
  codProgramasCompartidos: { type: String, trim: true, default: '' },
  programasCompartidos: { type: String, trim: true, default: '' },
  inExCampus: { type: String, trim: true, default: '' },        
  campus2: { type: String, trim: true, default: '' },
  tipoRequisito: { type: String, trim: true, default: '' },     
  requisitos: { type: String, trim: true, default: '' },
  bloquesHorarios: { type: String, trim: true, default: '' },    
  inExAtributo: { type: String, trim: true, default: '' },    
  atributos: { type: String, trim: true, default: '' },
  inExCohorte: { type: String, trim: true, default: '' },     
  cohortes: { type: String, trim: true, default: '' },
  atributosBolson: { type: String, trim: true, default: '' },  
}, {
  timestamps: true,
});

module.exports = mongoose.model('ProgramacionHoraria', ProgramacionHorariaSchema);