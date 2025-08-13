async function ensureIndexes(indexConfigs) {
    console.log('🔧 Iniciando creación de índices optimizados...');
    
    for (const config of indexConfigs) {
        try {
            const modelName = config.model.modelName || config.model.collection.name;
            console.log(`📊 Procesando índices para: ${modelName}`);
            
            for (const indexConfig of config.indexes) {
                try {
                    await config.model.collection.createIndex(
                        indexConfig.def, 
                        { 
                            name: indexConfig.name,
                            background: true, // No bloquear operaciones
                            ...indexConfig.options 
                        }
                    );
                    console.log(`  ✅ Índice creado: ${indexConfig.name}`);
                } catch (indexError) {
                    if (indexError.code === 85) { // IndexOptionsConflict
                        console.log(`  ⚠️ Índice ya existe: ${indexConfig.name}`);
                    } else {
                        console.error(`  ❌ Error creando índice ${indexConfig.name}:`, indexError.message);
                    }
                }
            }
        } catch (modelError) {
            console.error(`❌ Error procesando modelo ${config.model.modelName}:`, modelError.message);
        }
    }
    
    console.log('🎉 Configuración de índices completada\n');
}

module.exports = ensureIndexes;
