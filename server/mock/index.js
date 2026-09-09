// Único servidor que sigue corriendo del viejo backend Express: genera y
// envía por correo el reporte de jornadas en Excel (ver reportes.js). Todo lo
// demás (auth, tracking, CRUD de jornadas, fotos) migró a Supabase — la app
// móvil y el Dashboard hablan directo con Supabase, no con este servidor.
// server/src/routes/auth.example.ts queda como referencia histórica de un
// backend "desde cero" que nunca se completó; no tiene relación con este
// archivo.

const express = require("express");
const cors = require("cors");
const { generarYEnviarReporte } = require("./reportes");

const app = express();
app.use(cors());
// Límite por defecto de express.json() es 100kb — muy poco para
// /reports/export-excel, que recibe el arreglo completo de jornadas (hasta
// 5000, ver MAX_JORNADAS_POR_REPORTE en el Dashboard) con URLs de fotos y
// texto de incidencias embebidos. Con datos reales, ~40 jornadas ya superaban
// ese límite y el body-parser respondía 413 con el body vacío (sin JSON), lo
// que el Dashboard no podía distinguir de un rechazo genérico.
app.use(express.json({ limit: "20mb" }));

// Sin autenticación: la app móvil y el Dashboard ya no tienen sesión con este
// servidor (usan Supabase Auth / contraseña de admin propia), y este endpoint
// es sin estado — recibe el arreglo de jornadas completo en el body, no lee
// nada propio del servidor.
app.post("/reports/export-excel", async (req, res) => {
  const { correo, rangoInicio, rangoFin, jornadas } = req.body ?? {};

  if (!correo || !rangoInicio || !rangoFin || !Array.isArray(jornadas)) {
    return res.status(400).json({ mensaje: "Faltan datos para generar el reporte." });
  }

  try {
    const resultado = await generarYEnviarReporte({ correo, rangoInicio, rangoFin, jornadas });
    console.log(
      `Reporte enviado -> correo=${correo} jornadas=${jornadas.length}`,
      resultado.previewUrl ?? ""
    );
    res.status(200).json({ mensaje: "Reporte enviado.", ...resultado });
  } catch (err) {
    console.error("Error generando/enviando el reporte:", err);
    res.status(500).json({ mensaje: "No pudimos generar o enviar el reporte." });
  }
});

const PUERTO = process.env.PORT || 4000;
app.listen(PUERTO, () => {
  console.log(`Servidor de reportes escuchando en http://localhost:${PUERTO}`);
});

module.exports = app;
