const mongoose = require('mongoose');

const CargaHorariaSchema = new mongoose.Schema({
  periodo: { type: String, trim: true },
  campus: { type: String, trim: true },
  facultad: { type: String, trim: true },
  cod_dueno_curso: { type: String, trim: true }, // COD. DUEÑO CURSO
  dueno_curso: { type: String, trim: true },     // DUEÑO CURSO
  cod_curso: { type: String, trim: true },       // COD. CURSO
  nombre_curso: { type: String, trim: true },    // NOMBRE CURSO
  hrs_plan_curso: { type: Number },              // HRS PLAN CURSO
  nrc: { type: String, trim: true },
  seccion: { type: String, trim: true },
  estatus_curso: { type: String, trim: true }, // ESTATUS (para evitar colisión con un posible "estatus" del registro mismo)
  lst_crz: { type: String, trim: true },
  origen_lst_crz: { type: String, trim: true },
  sobrepaso_aula: { type: String, trim: true }, // Podría ser Boolean si los valores son consistentes
  tip_hor: { type: String, trim: true },         // TIP HOR
  met_edu: { type: String, trim: true },         // MET EDU
  maximo_alumnos: { type: Number },             // MAXIMO
  alumnos_reales: { type: Number },             // REAL
  alumnos_restantes: { type: Number },          // RESTANTE
  hrs_credito: { type: Number },                // Hrs CREDITO
  id_docente: { type: String, trim: true },      // ID DOCENTE (podría ser ObjectId si referencia a otra colección)
  id_rrhh: { type: String, trim: true },         // ID RRHH
  docente_asignado: { type: String, trim: true },// DOCENTE
  id_princ: { type: String, trim: true },        // ID PRINC
  tipo_jornada: { type: String, trim: true },    // TIPO JORNADA
  estado_docente_curso: { type: String, trim: true },// ESTADO DOCENTE (en el contexto de este curso)
  motivo_estado: { type: String, trim: true },   // MOTIVO
  fecha_inicio_curso: { type: Date },           // FECHA INICIO
  fecha_fin_curso: { type: Date },              // FECHA FIN
  dia_semana: { type: String, trim: true },      // DIA
  hora_clase: { type: String, trim: true },      // HORA (ej. "1930 - 2100")
  turno: { type: String, trim: true },
  edificio: { type: String, trim: true },
  aula: { type: String, trim: true },
  tipo_ambiente: { type: String, trim: true },
  in_ex_programa: { type: String, trim: true }, // IN/EX PROGRAMA
  cod_programas_compartidos: { type: String, trim: true },
  programas_compartidos: { type: String, trim: true },
  in_ex_campus: { type: String, trim: true },    // IN/EX CAMPUS
  campus2: { type: String, trim: true },
  tipo_requisito: { type: String, trim: true },
  requisitos: { type: String, trim: true },
  bloques_horarios: { type: String, trim: true },
  in_ex_atributo: { type: String, trim: true },  // IN/EX ATRIBUTO
  atributos: { type: String, trim: true },
  in_ex_cohorte: { type: String, trim: true },   // IN/EX COHORTE
  cohortes: { type: String, trim: true },
  atributos_bolson: { type: String, trim: true }
}, { 
  timestamps: true, 
  // Si los nombres en tu BD son exactamente como la lista larga con espacios y mayúsculas,
  // y no quieres que Mongoose pluralice el nombre de la colección:
  // collection: 'nombre_exacto_de_tu_coleccion_en_mongodb' 
});

module.exports = mongoose.model('CargaHoraria', CargaHorariaSchema);