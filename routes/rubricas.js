// routes/encuestasEsa.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Endpoint para obtener todos los registros sin paginado y con todos los campos
router.get('/', async (req, res) => {
  try {
    const registros = await mongoose.connection.db.collection('rubricas').find({}).toArray();
    res.json(registros);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener registros', error: err });
  }
});

module.exports = router;
