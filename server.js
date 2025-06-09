// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '250mb' })); // For handling large JSON payloads in bulk operations
app.use(express.urlencoded({ limit: '250mb', extended: true }));

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log(`Conectado a MongoDB en: ${process.env.MONGODB_URI}`);

    const ensureIndexes = require('./utils/initIndexes');

    // Importa los modelos
    const ProgramacionHoraria = require('./models/ProgramacionHoraria');
    const DisponibilidadAcompaniamiento = require('./models/DisponibilidadAcompaniamiento');
    const EncuestaEsa = require('./models/EncuestaEsa');
    const ReporteUnicoDocente = require('./models/ReporteUnicoDocente');
    // Agrega más modelos aquí

    // Configura los índices que quieres garantizar
    const indexConfigs = [
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
        model: DisponibilidadAcompaniamiento,
        indexes: [
          {
            name: 'dni_1_sede1DePreferenciaPresencial_1_dia_1_franja_1_turno_1',
            def: {
              dni: 1,
              sede1DePreferenciaPresencial: 1,
              dia: 1,
              franja: 1,
              turno: 1
            },
            options: { unique: true }
          }
        ]
      },
      {
        model: EncuestaEsa,
        indexes: [
          {
            name: 'codBanner_1_programa_1_modalidad_1',
            def: {
              codBanner: 1,
              programa: 1,
              modalidad: 1
            }
          }
        ]
      },
      {
        model: ReporteUnicoDocente,
        indexes: [
          { name: 'codigoBanner_1', def: { codigoBanner: 1 } },
          { name: 'dni_1', def: { dni: 1 }, options: { unique: true } }
        ]
      }
    ];
    // Corre el inicializador
    await ensureIndexes(indexConfigs);

  })
  .catch(err => console.error('No se pudo conectar a MongoDB...', err));

// Rutas
const programacionHorariaRouter = require('./routes/programacionHoraria');
app.use('/api/programacion-horaria', programacionHorariaRouter);

// NUEVA RUTA PARA ENCUESTAS ESA
const encuestasEsaRouter = require('./routes/encuestasEsa'); // Importar el nuevo router
app.use('/api/esa', encuestasEsaRouter); // Montar el router en /api/esa

// NUEVA RUTA PARA DISPONIBILIDAD DE ACOMPAÑAMIENTO
const disponibilidadAcompaniamientoRouter = require('./routes/disponibilidadAcompaniamiento'); // Importar
app.use('/api/disponibilidad-acompaniamiento', disponibilidadAcompaniamientoRouter); // Montar en la ruta deseada

// NUEVA RUTA PARA RUBRICAS
const rubricas = require('./routes/rubricas'); // Importar
app.use('/api/rubricas', rubricas); // Montar en la ruta deseada

// NUEVA RUTA PARA RUBRICAS
const reporteUnicoDocente = require('./routes/reporteUnicoDocente'); // Importar
app.use('/api/reporte-unico-docente', reporteUnicoDocente); // Montar en la ruta deseada

// NUEVA RUTA PARA RUBRICAS
const superMalla = require('./routes/superMalla'); // Importar
app.use('/api/super-malla', superMalla); // Montar en la ruta deseada

const spDA002LimpiarRouter = require('./routes/spDA002LimpiarRoute');
app.use('/api/sp-da002-limpiar', spDA002LimpiarRouter);

const asignacionesEsaRouter = require('./routes/asignaciones');
app.use('/api/asignaciones', asignacionesEsaRouter);

app.get('/', (req, res) => {
  res.send('API de Gestión Educativa funcionando!');
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});