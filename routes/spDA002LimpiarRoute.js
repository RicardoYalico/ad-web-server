const express = require('express');
const router = express.Router();
// Asegúrate de que la ruta al módulo sea la correcta en tu proyecto
const { spDA004NormalizarAsignaciones } = require('../store_procedures/spDA002Limpiar');

/**
 * @swagger
 * /api/asignaciones/procesar:
 * post:
 * summary: Procesa y genera las asignaciones de docentes para un semestre específico.
 * description: >
 * Ejecuta un proceso complejo que consolida la programación horaria, encuestas (ESA),
 * y planes de desarrollo (PIDD) para generar un documento de asignación unificado por docente.
 * Utiliza los datos más recientes de cada colección fuente basándose en el campo 'fechaCarga'.
 * tags: [Asignaciones]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * semestre:
 * type: string
 * description: El semestre que se desea procesar. Debe tener el formato "YYYY-N".
 * example: "2025-1"
 * required:
 * - semestre
 * responses:
 * 200:
 * description: Proceso ejecutado correctamente. Devuelve el resultado del procesamiento.
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * message:
 * type: string
 * example: 'Proceso ejecutado correctamente.'
 * total:
 * type: integer
 * description: El número total de docentes únicos procesados.
 * example: 150
 * data:
 * type: array
 * description: La lista de documentos de asignación de docentes generados.
 * items:
 * $ref: '#/components/schemas/DocenteProcesado' # Asumiendo una definición de esquema Swagger
 * 400:
 * description: Error en la solicitud del cliente porque falta el 'semestre' en el cuerpo de la solicitud.
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * message:
 * type: string
 * example: 'El parámetro "semestre" es requerido en el cuerpo de la solicitud.'
 * 500:
 * description: Error interno del servidor durante la ejecución del proceso.
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * message:
 * type: string
 * example: 'Error al ejecutar el proceso de asignación'
 * error:
 * type: string
 * description: El mensaje de error detallado.
 */
router.post('/', async (req, res) => {
  try {
    // Leer el semestre desde el cuerpo (body) de la solicitud POST.
    const { semestre } = req.body;

    // Validar que el parámetro semestre fue proporcionado.
    if (!semestre) {
      return res.status(400).json({ message: 'El parámetro "semestre" es requerido en el cuerpo de la solicitud.' });
    }

    console.log(`Recibida solicitud POST para procesar el semestre: ${semestre}`);
    
    // Pasar el semestre a tu store procedure.
    const result = await spDA004NormalizarAsignaciones(semestre);

    res.json({
      message: 'Proceso ejecutado correctamente.',
      total: result.length,
      data: result
    });
  } catch (error) {
    // Capturar cualquier error que ocurra durante la ejecución del SP.
    console.error(`Error en el endpoint de asignaciones para el semestre ${req.body.semestre}:`, error);
    res.status(500).json({ 
      message: 'Error al ejecutar el proceso de asignación', 
      error: error.message 
    });
  }
});

module.exports = router;

// Nota: Para que la referencia a '#/components/schemas/DocenteProcesado' en Swagger funcione,
// necesitarías definir ese esquema en tu configuración principal de Swagger.
// También, asegúrate de tener el middleware 'express.json()' habilitado en tu app para poder parsear el body.
// Ejemplo en tu archivo principal (app.js o index.js): app.use(express.json());
