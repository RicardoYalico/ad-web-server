require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ limit: '250mb', extended: true }));

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log(`Conectado a MongoDB en: ${process.env.MONGODB_URI}`);
    
    const ensureIndexes = require('./utils/initIndexes');
    
    // Importar modelos
    const ProgramacionHoraria = require('./models/ProgramacionHoraria');
    const DisponibilidadAcompaniamiento = require('./models/DisponibilidadAcompaniamiento');
    const EncuestaEsa = require('./models/EncuestaEsa');
    const ReporteUnicoDocente = require('./models/ReporteUnicoDocente');
    const DocentePerfil = require('./models/ProgramacionHoraria/DocentePerfil');
    const DocenteCurso = require('./models/ProgramacionHoraria/DocenteCurso');
    const CursoHorario = require('./models/ProgramacionHoraria/CursoHorario');
    const AsignacionEspecialistaDocente = require('./models/AsignacionEspecialistaDocente');
    const HistorialAsignacion = require('./models/HistorialAsignacion');
    
    // ✅ CONFIGURACIÓN COMPLETA DE ÍNDICES OPTIMIZADOS
    const indexConfigs = [
      // Índices existentes
      {
        model: ProgramacionHoraria,
        indexes: [
          { name: 'idPrinc_1', def: { idPrinc: 1 } },
          { name: 'periodo_1', def: { periodo: 1 } },
          { name: 'idDocente_1', def: { idDocente: 1 } },
          { name: 'metEdu_1', def: { metEdu: 1 } },
          { name: 'nombreCurso_1', def: { nombreCurso: 1 } },
          { name: 'nrc_1', def: { nrc: 1 }, options: { sparse: true } }
        ]
      },
      {
        model: EncuestaEsa,
        indexes: [
          {
            name: 'codBanner_1_programa_1_modalidad_1',
            def: { codBanner: 1, programa: 1, modalidad: 1 }
          }
        ]
      },
      {
        model: ReporteUnicoDocente,
        indexes: [
          { name: 'codigoBanner_1', def: { codigoBanner: 1 } }
        ]
      },
      
      // ✅ NUEVOS ÍNDICES OPTIMIZADOS PARA MATCH
      {
        model: DocentePerfil,
        indexes: [
          { 
            name: 'semestre_1_fechaHoraEjecucion_-1', 
            def: { semestre: 1, fechaHoraEjecucion: -1 } 
          },
          { 
            name: 'idDocente_1_semestre_1', 
            def: { idDocente: 1, semestre: 1 } 
          },
          { 
            name: 'programa_1_modalidad_1_semestre_1', 
            def: { programa: 1, modalidad: 1, semestre: 1 } 
          },
          {
            name: 'promedioEsa_-1_semestre_1',
            def: { promedioEsa: -1, semestre: 1 }
          }
        ]
      },
      {
        model: DocenteCurso,
        indexes: [
          { 
            name: 'semestre_1_fechaHoraEjecucion_-1', 
            def: { semestre: 1, fechaHoraEjecucion: -1 } 
          },
          { 
            name: 'idDocente_1_semestre_1', 
            def: { idDocente: 1, semestre: 1 } 
          },
          { 
            name: 'seccion_1_semestre_1', 
            def: { seccion: 1, semestre: 1 } 
          },
          { 
            name: 'codCurso_1_idDocente_1_semestre_1', 
            def: { codCurso: 1, idDocente: 1, semestre: 1 } 
          },
          {
            name: 'programa_1_modalidad_1_semestre_1',
            def: { programa: 1, modalidad: 1, semestre: 1 }
          }
        ]
      },
      {
        model: CursoHorario,
        indexes: [
          { 
            name: 'semestre_1_fechaHoraEjecucion_-1', 
            def: { semestre: 1, fechaHoraEjecucion: -1 } 
          },
          { 
            name: 'seccion_1_semestre_1', 
            def: { seccion: 1, semestre: 1 } 
          },
          {
            name: 'dia_1_campus_1',
            def: { dia: 1, campus: 1 }
          }
        ]
      },
      {
        model: DisponibilidadAcompaniamiento,
        indexes: [
          { 
            name: 'dni_1', 
            def: { dni: 1 } 
          },
                    { 
            name: 'dia_1_sede1DePreferenciaPresencial_1', 
            def: { dia: 1, sede1DePreferenciaPresencial: 1 } 
          },
          { 
            name: 'dia_1_sede1DePreferenciaPresencial_1_franja_1', 
            def: { dia: 1, sede1DePreferenciaPresencial: 1, franja: 1 } 
          },
          { 
            name: 'sede1DePreferenciaPresencial_1', 
            def: { sede1DePreferenciaPresencial: 1 } 
          }
        ]
      },
      {
        model: AsignacionEspecialistaDocente,
        indexes: [
          { 
            name: 'semestre_1', 
            def: { semestre: 1 } 
          },
          { 
            name: 'idDocente_1_semestre_1', 
            def: { idDocente: 1, semestre: 1 } 
          },
          { 
            name: 'especialistaDni_1_semestre_1', 
            def: { especialistaDni: 1, semestre: 1 } 
          },
          {
            name: 'especialistaDni_1_fechaHoraEjecucion_-1',
            def: { especialistaDni: 1, fechaHoraEjecucion: -1 }
          }
        ]
      },
      {
        model: HistorialAsignacion,
        indexes: [
          { 
            name: 'semestre_1_fechaHoraEjecucion_-1', 
            def: { semestre: 1, fechaHoraEjecucion: -1 } 
          },
          { 
            name: 'especialistaDni_1_fechaHoraEjecucion_-1', 
            def: { especialistaDni: 1, fechaHoraEjecucion: -1 } 
          },
          { 
            name: 'estadoCambio_1_fechaHoraEjecucion_-1', 
            def: { estadoCambio: 1, fechaHoraEjecucion: -1 } 
          },
          {
            name: 'idDocente_1_semestre_1',
            def: { idDocente: 1, semestre: 1 }
          }
        ]
      }
    ];
    
    // Ejecutar creación de índices
    await ensureIndexes(indexConfigs);
  })
  .catch(err => console.error('No se pudo conectar a MongoDB...', err));

// Rutas (mantener las existentes)
const programacionHorariaRouter = require('./routes/programacionHoraria');
app.use('/api/programacion-horaria', programacionHorariaRouter);

const encuestasEsaRouter = require('./routes/encuestasEsa');
app.use('/api/esa', encuestasEsaRouter);

const disponibilidadAcompaniamientoRouter = require('./routes/disponibilidadAcompaniamiento');
app.use('/api/disponibilidad-acompaniamiento', disponibilidadAcompaniamientoRouter);

const rubricas = require('./routes/rubricas');
app.use('/api/rubricas', rubricas);

const reporteUnicoDocente = require('./routes/reporteUnicoDocente');
app.use('/api/reporte-unico-docente', reporteUnicoDocente);

const superMalla = require('./routes/superMalla');
app.use('/api/super-malla', superMalla);

const spDA002LimpiarRouter = require('./routes/spDA002LimpiarRoute');
app.use('/api/sp-da002-limpiar', spDA002LimpiarRouter);

const asignacionesEsaRouter = require('./routes/asignaciones');
app.use('/api/asignaciones', asignacionesEsaRouter);

const planIntegralDocenteRouter = require('./routes/planIntegralDocente');
app.use('/api/plan-integral-docente', planIntegralDocenteRouter);

const asignacionCambiosRouter = require('./routes/asignacionCambios');
app.use('/api/asignacion-cambios', asignacionCambiosRouter);

const asignacionEspecialistaDocentesRouter = require('./routes/asignacionEspecialistaDocentes');
app.use('/api/asignacion-especialista-docentes', asignacionEspecialistaDocentesRouter);

const historialRoutes = require('./routes/historialAsignaciones');
app.use('/api/historial-asignaciones', historialRoutes);

const notificaciones = require('./routes/notificaciones');
app.use('/api/notificaciones', notificaciones);

const segmentaciones = require('./routes/segmentaciones');
app.use('/api/segmentaciones', segmentaciones);

const induccionDocente = require('./routes/induccionDocente');
app.use('/api/induccion-docente', induccionDocente);

app.get('/', (req, res) => {
  res.send('API de Gestión Educativa funcionando!');
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});