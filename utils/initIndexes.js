async function ensureIndexes(configs) {
  for (const config of configs) {
    const { model, indexes } = config;
    try {
      const collectionIndexes = await model.collection.indexes();
      const indexNames = collectionIndexes.map(i => i.name);

      for (const idx of indexes) {
        if (!indexNames.includes(idx.name)) {
          await model.collection.createIndex(idx.def);
          console.log(`✅ Índice ${idx.name} creado en ${model.collection.collectionName}.`);
        } else {
          console.log(`ℹ️ Índice ${idx.name} ya existe en ${model.collection.collectionName}.`);
        }
      }

    } catch (err) {
      console.error(`❌ Error verificando/creando índices en ${model.collection.collectionName}:`, err);
    }
  }
}

module.exports = ensureIndexes;
