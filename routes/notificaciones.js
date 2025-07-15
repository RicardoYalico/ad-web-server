const express = require('express');
const router = express.Router();
const NotificacionEspecialista = require('../models/Notificaciones/NotificacionEspecialista');

/**
 * @route   GET /api/notificaciones/especialista/:dni/campanita
 * @desc    Obtener notificaciones para la campanita (auto-marca como vistas)
 * @access  Public
 */
router.get('/especialista/:dni/campanita', async (req, res) => {
    try {
        const { dni } = req.params;
        const { limite = 15 } = req.query;

        // 1. Obtener notificaciones recientes
        const notificaciones = await NotificacionEspecialista.find({
            especialistaDni: dni
        })
        .sort({ createdAt: -1 })
        .limit(parseInt(limite))
        .lean();

        // 2. Contar no vistas ANTES de marcarlas
        const noVistas = notificaciones.filter(n => n.estado === 'NO_VISTA').length;

        // 3. Marcar automáticamente NO_VISTA como VISTA
        if (noVistas > 0) {
            await NotificacionEspecialista.updateMany(
                { 
                    especialistaDni: dni, 
                    estado: 'NO_VISTA' 
                },
                { 
                    estado: 'VISTA',
                    fechaVista: new Date()
                }
            );

            // 4. Actualizar el array local para reflejar el cambio
            notificaciones.forEach(notif => {
                if (notif.estado === 'NO_VISTA') {
                    notif.estado = 'VISTA';
                    notif.fechaVista = new Date();
                }
            });
        }

        res.json({
            especialistaDni: dni,
            noVistas, // Count original antes del auto-marcado
            notificaciones,
            total: notificaciones.length
        });

    } catch (err) {
        console.error('Error al obtener notificaciones de campanita:', err);
        res.status(500).json({ 
            message: 'Error al obtener las notificaciones de campanita', 
            error: err.message 
        });
    }
});

/**
 * @route   GET /api/notificaciones/especialista/:dni/contador
 * @desc    Obtener solo contadores para badges
 * @access  Public
 */
router.get('/especialista/:dni/contador', async (req, res) => {
    try {
        const { dni } = req.params;

        const [noVistas, vistas, leidas] = await Promise.all([
            NotificacionEspecialista.countDocuments({
                especialistaDni: dni,
                estado: 'NO_VISTA'
            }),
            NotificacionEspecialista.countDocuments({
                especialistaDni: dni,
                estado: 'VISTA'
            }),
            NotificacionEspecialista.countDocuments({
                especialistaDni: dni,
                estado: 'LEIDA'
            })
        ]);

        res.json({
            especialistaDni: dni,
            noVistas,    // Para badge rojo de campanita
            vistas,      // Vistas pero no leídas
            leidas,      // Total leídas
            total: noVistas + vistas + leidas
        });

    } catch (err) {
        console.error('Error al obtener contador de notificaciones:', err);
        res.status(500).json({ 
            message: 'Error al obtener el contador de notificaciones', 
            error: err.message 
        });
    }
});

/**
 * @route   GET /api/notificaciones/especialista/:dni
 * @desc    Obtener todas las notificaciones de un especialista (con paginación)
 * @access  Public
 */
router.get('/especialista/:dni', async (req, res) => {
    try {
        const { dni } = req.params;
        const { estado, tipoNotificacion, limite = 50, pagina = 1 } = req.query;

        const query = { especialistaDni: dni };
        
        if (estado) {
            const estados = estado.split(',').map(e => e.trim().toUpperCase());
            query.estado = { $in: estados };
        }
        
        if (tipoNotificacion) {
            const tipos = tipoNotificacion.split(',').map(t => t.trim().toUpperCase());
            query.tipoNotificacion = { $in: tipos };
        }

        const skip = (parseInt(pagina) - 1) * parseInt(limite);

        const [notificaciones, total, resumen] = await Promise.all([
            NotificacionEspecialista.find(query)
                .sort({ 'detallesCambio.fechaHoraEjecucion': -1, createdAt: -1 })
                .limit(parseInt(limite))
                .skip(skip)
                .lean(),
            NotificacionEspecialista.countDocuments(query),
            NotificacionEspecialista.obtenerResumenEspecialista(dni)
        ]);

        res.json({
            especialistaDni: dni,
            notificaciones,
            paginacion: {
                total,
                pagina: parseInt(pagina),
                limite: parseInt(limite),
                totalPaginas: Math.ceil(total / parseInt(limite))
            },
            resumen
        });
    } catch (err) {
        console.error('Error al obtener notificaciones del especialista:', err);
        res.status(500).json({ 
            message: 'Error al obtener las notificaciones', 
            error: err.message 
        });
    }
});

/**
 * @route   GET /api/notificaciones/especialista/:dni/no-leidas
 * @desc    Obtener solo las notificaciones no leídas (NO_VISTA + VISTA)
 * @access  Public
 */
router.get('/especialista/:dni/no-leidas', async (req, res) => {
    try {
        const { dni } = req.params;

        const notificaciones = await NotificacionEspecialista.find({
            especialistaDni: dni,
            estado: { $in: ['NO_VISTA', 'VISTA'] }
        })
        .sort({ prioridad: -1, 'detallesCambio.fechaHoraEjecucion': -1 })
        .lean();

        const resumen = {
            total: notificaciones.length,
            noVistas: notificaciones.filter(n => n.estado === 'NO_VISTA').length,
            vistas: notificaciones.filter(n => n.estado === 'VISTA').length,
            porPrioridad: notificaciones.reduce((acc, notif) => {
                acc[notif.prioridad] = (acc[notif.prioridad] || 0) + 1;
                return acc;
            }, {}),
            porTipo: notificaciones.reduce((acc, notif) => {
                acc[notif.tipoNotificacion] = (acc[notif.tipoNotificacion] || 0) + 1;
                return acc;
            }, {})
        };

        res.json({
            especialistaDni: dni,
            notificaciones,
            resumen
        });

    } catch (err) {
        console.error('Error al obtener notificaciones no leídas:', err);
        res.status(500).json({ 
            message: 'Error al obtener las notificaciones no leídas', 
            error: err.message 
        });
    }
});

/**
 * @route   PUT /api/notificaciones/:id/marcar-leida
 * @desc    Marcar una notificación como leída (al hacer clic en detalle)
 * @access  Public
 */
router.put('/:id/marcar-leida', async (req, res) => {
    try {
        const { id } = req.params;

        const notificacion = await NotificacionEspecialista.findById(id);
        
        if (!notificacion) {
            return res.status(404).json({ message: 'Notificación no encontrada' });
        }

        if (notificacion.estado === 'LEIDA') {
            return res.json({ 
                message: 'La notificación ya estaba marcada como leída',
                notificacion 
            });
        }

        await notificacion.marcarComoLeida();

        res.json({
            message: 'Notificación marcada como leída exitosamente',
            notificacion
        });

    } catch (err) {
        console.error('Error al marcar notificación como leída:', err);
        res.status(500).json({ 
            message: 'Error al marcar la notificación como leída', 
            error: err.message 
        });
    }
});

/**
 * @route   PUT /api/notificaciones/especialista/:dni/marcar-todas-leidas
 * @desc    Marcar todas las notificaciones pendientes como leídas
 * @access  Public
 */
router.put('/especialista/:dni/marcar-todas-leidas', async (req, res) => {
    try {
        const { dni } = req.params;

        const resultado = await NotificacionEspecialista.updateMany(
            { 
                especialistaDni: dni, 
                estado: { $in: ['NO_VISTA', 'VISTA'] }
            },
            { 
                estado: 'LEIDA',
                fechaLectura: new Date()
            }
        );

        res.json({
            message: `${resultado.modifiedCount} notificaciones marcadas como leídas`,
            especialistaDni: dni,
            modificadas: resultado.modifiedCount
        });

    } catch (err) {
        console.error('Error al marcar todas las notificaciones como leídas:', err);
        res.status(500).json({ 
            message: 'Error al marcar todas las notificaciones como leídas', 
            error: err.message 
        });
    }
});

/**
 * @route   DELETE /api/notificaciones/especialista/:dni/limpiar-antiguas
 * @desc    Eliminar notificaciones leídas de más de 30 días
 * @access  Public
 */
router.delete('/especialista/:dni/limpiar-antiguas', async (req, res) => {
    try {
        const { dni } = req.params;
        const { dias = 30 } = req.query;

        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - parseInt(dias));

        const resultado = await NotificacionEspecialista.deleteMany({
            especialistaDni: dni,
            estado: 'LEIDA',
            fechaLectura: { $lt: fechaLimite }
        });

        res.json({
            message: `${resultado.deletedCount} notificaciones antiguas eliminadas`,
            especialistaDni: dni,
            eliminadas: resultado.deletedCount,
            criterio: `Leídas hace más de ${dias} días`
        });

    } catch (err) {
        console.error('Error al limpiar notificaciones antiguas:', err);
        res.status(500).json({ 
            message: 'Error al limpiar notificaciones antiguas', 
            error: err.message 
        });
    }
});

/**
 * @route   GET /api/notificaciones/resumen
 * @desc    Obtener resumen general de notificaciones del sistema
 * @access  Public
 */
router.get('/resumen', async (req, res) => {
    try {
        const { semestre } = req.query;
        
        const matchCondition = semestre ? 
            { 'detallesCambio.semestre': semestre } : {};

        const resumen = await NotificacionEspecialista.aggregate([
            { $match: matchCondition },
            {
                $group: {
                    _id: {
                        estado: '$estado',
                        tipo: '$tipoNotificacion'
                    },
                    count: { $sum: 1 },
                    especialistas: { $addToSet: '$especialistaDni' }
                }
            },
            {
                $group: {
                    _id: '$_id.estado',
                    tipos: {
                        $push: {
                            tipo: '$_id.tipo',
                            count: '$count',
                            especialistasUnicos: { $size: '$especialistas' }
                        }
                    },
                    total: { $sum: '$count' }
                }
            }
        ]);

        const especialistasConNotificaciones = await NotificacionEspecialista.distinct(
            'especialistaDni', 
            matchCondition
        );

        res.json({
            resumen,
            especialistasConNotificaciones: especialistasConNotificaciones.length,
            filtros: { semestre: semestre || 'todos' }
        });

    } catch (err) {
        console.error('Error al obtener resumen de notificaciones:', err);
        res.status(500).json({ 
            message: 'Error al obtener el resumen de notificaciones', 
            error: err.message 
        });
    }
});

module.exports = router;