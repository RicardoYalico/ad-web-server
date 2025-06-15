const mongoose = require('mongoose');



async function aggLimpiarDA002() {
    try {
        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('No se pudo obtener la instancia de la base de datos desde Mongoose.');
        }

        const docentesCollection = db.collection('programacionhorarias');
        const aggDocentes = [
            { $match: { idPrinc: 'Y' } },
            {
                $group: {
                    _id: {
                        periodo: "$periodo",
                        campus: "$campus",
                        facultad: "$facultad",
                        codDuenioCurso: "$codDuenioCurso",
                        duenioCurso: "$duenioCurso",
                        codCurso: "$codCurso",
                        nombreCurso: "$nombreCurso",
                        hrsPlanCurso: "$hrsPlanCurso",
                        nrc: "$nrc",
                        seccion: "$seccion",
                        estatus: "$estatus",
                        lstCrz: "$lstCrz",
                        origenLstCrz: "$origenLstCrz",
                        sobrepasoAula: "$sobrepasoAula",
                        tipHor: "$tipHor",
                        metEdu: "$metEdu",
                        maximo: "$maximo",
                        real: "$real",
                        restante: "$restante",
                        hrsCredito: "$hrsCredito",
                        idDocente: "$idDocente",
                        idRrhh: "$idRrhh",
                        docente: "$docente",
                        tipoJornada: "$tipoJornada",
                        estadoDocente: "$estadoDocente",
                        motivo: "$motivo",
                        fechaInicio: "$fechaInicio",
                        fechaFin: "$fechaFin",
                        dia: "$dia",
                        hora: "$hora",
                        turno: "$turno",
                        edificio: "$edificio",
                        aula: "$aula",
                        tipoAmbiente: "$tipoAmbiente",
                        inExPrograma: "$inExPrograma",
                        inExCampus: "$inExCampus",
                        campus2: "$campus2",
                        tipoRequisito: "$tipoRequisito",
                        requisitos: "$requisitos",
                        bloquesHorarios: "$bloquesHorarios",
                        inExAtributo: "$inExAtributo",
                        atributos: "$atributos",
                        inExCohorte: "$inExCohorte",
                        cohortes: "$cohortes",
                        atributosBolson: "$atributosBolson"
                    },
                    docCompleto: { $first: "$$ROOT" }
                }
            },
            {
                $replaceRoot: { newRoot: "$docCompleto" }
            },
            {
                $addFields: { procesado: true }
            },
            {
                $merge: {
                    into: "programacionhorarias_limpia",
                    whenMatched: "replace",
                    whenNotMatched: "insert"
                }
            }
        ];

        const resultadoFinal = await docentesCollection.aggregate(aggDocentes, { allowDiskUse: true }).toArray();

        return resultadoFinal;

    } catch (error) {
        console.error('Error en aggLimpiarDA002:', error);
        throw error;
    }
}

module.exports = aggLimpiarDA002;
