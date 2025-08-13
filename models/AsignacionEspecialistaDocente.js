const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * @description Sub-esquema para el detalle del acompañamiento en un bloque horario específico.
 * Se añade a un horario solo si hay una coincidencia con la disponibilidad de un especialista.
 */
const AcompanamientoInfoSchema = new Schema({
  especialistaDni: { type: String, required: true, trim: true },
  nombreEspecialista: { type: String, required: true, trim: true },
  estado: { 
    type: String, 
    enum: ['Planificado', 'Confirmado', 'Realizado', 'Cancelado'], 
    default: 'Planificado' 
  },
  tipo: { type: String, trim: true }, 
  disponibilidadEspecialista: { type: Object } 
}, { _id: false });

/**
 * @description Sub-esquema para los horarios de los cursos.
 * Es una réplica del horario original con la adición opcional de la información del acompañamiento.
 */
const HorarioSchema = new Schema({
  fechaInicio: { type: String, trim: true },
  fechaFin: { type: String, trim: true },
  dia: { type: String, trim: true },
  hora: { type: String, trim: true },
  turno: { type: String, trim: true },
  edificio: { type: String, trim: true },
  campus: { type: String, trim: true },
  aula: { type: String, trim: true },
  estadoHistorico: { type: String, trim: true },
  acompanamiento: { type: AcompanamientoInfoSchema, required: false } 
}, { _id: false });

/**
 * @description Sub-esquema para los cursos, que ahora utiliza el HorarioSchema modificado.
 */
const CursoSchema = new Schema({
  nombreCurso: { type: String, trim: true },
  supermalla: { type: Object, required: false }, // o mongoose.Schema.Types.Mixed
  codCurso: { type: String, trim: true },
  seccion: { type: String, trim: true },
  periodo: { type: String, trim: true },
  nrc: { type: String, trim: true },
  metEdu: { type: String, trim: true },
  horarios: [HorarioSchema],
  estadoHistorico: { type: String, trim: true }
}, { _id: false });


/**
 * @description Modelo que representa una versión de la asignación de especialistas a docentes para una ejecución específica.
 */
const AsignacionEspecialistaDocenteSchema = new Schema({
  // --- DATOS DE LA ASIGNACIÓN ---
  idDocente: { type: String, required: true, trim: true, index: true },
  docente: { type: String, required: true, trim: true },
  RolColaborador: { type: String, trim: true },
  facultad: { type: String, trim: true },
  programa: { type: String, trim: true },
  modalidad: { type: String, trim: true },
  promedioEsa: { type: Number },
    // --- CURSOS CON HORARIOS ENRIQUECIDOS ---
  segmento: {
        type: Object, // o mongoose.Schema.Types.Mixed
        required: false // O true, dependiendo de tus reglas de negocio
    },
    segmentos: {
        type: Array, // o mongoose.Schema.Types.Mixed
        required: false // O true, dependiendo de tus reglas de negocio
    },
  semestre: { type: String, trim: true, index: true },
  estadoHistorico: { type: String, trim: true },
  
  // --- DATOS DEL ESPECIALISTA ASIGNADO ---
  // CAMBIO: 'required' se elimina para permitir docentes sin especialista.
  especialistaDni: { type: String, trim: true, index: true },
  nombreEspecialista: { type: String, trim: true },
  

  // --- CURSOS CON HORARIOS ENRIQUECIDOS ---
  cursos: [CursoSchema],

  inducciondocente: {
        type: Object, // o mongoose.Schema.Types.Mixed
        required: false // O true, dependiendo de tus reglas de negocio
    },
    // --- CURSOS CON HORARIOS ENRIQUECIDOS ---
  pidd: {
        type: Object, // o mongoose.Schema.Types.Mixed
        required: false // O true, dependiendo de tus reglas de negocio
    },
  rud: {
        type: Object, // o mongoose.Schema.Types.Mixed
        required: false // O true, dependiendo de tus reglas de negocio
  },
  esa: {
    type: Object, // o mongoose.Schema.Types.Mixed
    required: false // O true, dependiendo de tus reglas de negocio
  },
  programacion: {
    type: Array, // o mongoose.Schema.Types.Mixed
    required: false // O true, dependiendo de tus reglas de negocio
  },

  asignaciones: {
    type: Array, // o mongoose.Schema.Types.Mixed 
    required: false // O true, dependiendo de tus reglas de negocio
  },

  // --- METADATOS DE LA EJECUCIÓN ---
  estadoGeneral: {
    type: String,
    required: false,
    // CAMBIO: Se añade 'Sin Asignar' para que sea un valor válido.
    // enum: ['Planificado', 'En Progreso', 'Completado', 'Cancelado', 'Sin Asignar'],
  },
  // Campo clave para el versionado
  fechaHoraEjecucion: {
    type: Date,
    required: true,
    index: true
  }
}, {
  // Se deshabilita timestamps (createdAt, updatedAt) ya que fechaHoraEjecucion cumple esa función.
  timestamps: false 
});

// *** ÍNDICE ÚNICO CORREGIDO ***
// Asegura que dentro de una misma ejecución (misma fechaHoraEjecucion), la combinación
// de docente, especialista y semestre sea única. Permite repeticiones en ejecuciones diferentes.
AsignacionEspecialistaDocenteSchema.index(
    { idDocente: 1, especialistaDni: 1, semestre: 1, fechaHoraEjecucion: 1 }, 
    { unique: true }
);


module.exports = mongoose.model('AsignacionEspecialistaDocente', AsignacionEspecialistaDocenteSchema);
