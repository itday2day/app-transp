// Mock local del backend, solo para poder probar el login de la app sin
// desplegar el servidor real (ver server/src/routes/auth.example.ts para la
// versión con PostgreSQL + bcrypt + JWT). No usar en producción: la
// contraseña se compara en texto plano y el "token" no es un JWT real.

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { WebSocketServer } = require("ws");
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

// ── WebSocket de solo lectura para el Dashboard (posiciones en tiempo real) ─
// Clientes de solo lectura (el Dashboard web); no hay autenticación en el
// mock. Se difunde a todos por igual: para una flota chica no hace falta
// filtrar por chofer del lado del servidor.
const clientesWs = new Set();

function difundir(mensaje) {
  const payload = JSON.stringify(mensaje);
  for (const cliente of clientesWs) {
    if (cliente.readyState === 1 /* OPEN */) cliente.send(payload);
  }
}

// Almacenamiento "mock" de fotos: en disco local, servido por HTTP. Hace de
// stand-in para un bucket real (S3/Firebase/Cloudinary) — misma interfaz
// (URL pública estable), sin necesitar credenciales de nube para desarrollo.
const CARPETA_UPLOADS = path.join(__dirname, "uploads");
fs.mkdirSync(CARPETA_UPLOADS, { recursive: true });
app.use("/uploads", express.static(CARPETA_UPLOADS));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CARPETA_UPLOADS),
  filename: (req, file, cb) => {
    // idCliente viaja como primer campo del FormData (ver syncService.ts),
    // así que ya está disponible en req.body cuando multer procesa los archivos.
    const idCliente = req.body.idCliente || "sin-id";
    cb(null, `${idCliente}-${file.fieldname}-${Date.now()}.jpg`);
  },
});

const upload = multer({ storage });

const CAMPO_A_CLAVE_URL = {
  fotoTacometroInicial: "fotoCheckInUrl",
  fotoRuta: "fotoRutaUrl",
  fotoTacometroFinal: "fotoCheckOutUrl",
};

function construirUrlsFotos(req, archivosPorCampo) {
  const fotos = {};
  for (const [campo, archivos] of Object.entries(archivosPorCampo ?? {})) {
    const clave = CAMPO_A_CLAVE_URL[campo];
    if (clave && archivos[0]) {
      fotos[clave] = `${req.protocol}://${req.get("host")}/uploads/${archivos[0].filename}`;
    }
  }
  return fotos;
}

// numeroEmpleado -> chofer. Se pierde al reiniciar el servidor (solo memoria).
const choferes = new Map();
choferes.set("01", {
  id: "chofer-prueba-1",
  numeroEmpleado: "01",
  nombre: "Juan Pérez",
  contrasena: "1234",
});

app.post("/auth/login", (req, res) => {
  const { numeroEmpleado, contrasena } = req.body ?? {};

  const chofer = choferes.get(numeroEmpleado);

  if (!chofer || chofer.contrasena !== contrasena) {
    return res.status(401).json({ mensaje: "Número de empleado o contraseña incorrectos." });
  }

  res.json({
    token: `mock-token-${chofer.id}`,
    usuario: {
      id: chofer.id,
      nombre: chofer.nombre,
      numeroEmpleado: chofer.numeroEmpleado,
    },
  });
});

app.post("/auth/registro", (req, res) => {
  const { numeroEmpleado, nombre, apellidos, dni, fechaNacimiento, paisNacimiento, contrasena, sexo } =
    req.body ?? {};

  if (
    !numeroEmpleado ||
    !nombre ||
    !apellidos ||
    !dni ||
    !fechaNacimiento ||
    !paisNacimiento ||
    !contrasena ||
    !sexo
  ) {
    return res.status(400).json({ mensaje: "Faltan datos para crear la cuenta." });
  }

  if (choferes.has(numeroEmpleado)) {
    return res.status(409).json({ mensaje: "Ese número de empleado ya tiene una cuenta registrada." });
  }

  const nombreCompleto = `${nombre} ${apellidos}`.trim();

  choferes.set(numeroEmpleado, {
    id: `chofer-${numeroEmpleado}`,
    numeroEmpleado,
    contrasena,
    nombre: nombreCompleto,
    dni,
    paisNacimiento,
    fechaNacimiento,
    sexo,
  });

  console.log(`Cuenta creada -> numeroEmpleado: ${numeroEmpleado}  nombre: ${nombreCompleto}`);

  res.status(201).json({ mensaje: "Cuenta creada correctamente." });
});

function exigirToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ mensaje: "No autorizado." });
  }
  next();
}

// idCliente -> última versión conocida de esa jornada.
//
// OJO: una misma jornada (mismo idCliente) se sincroniza DOS VECES — una vez
// al hacer check-in ('abierta') y otra vez al hacer check-out ('cerrada'),
// porque registrarCheckOut() vuelve a marcar la fila como 'pendiente' en
// SQLite. La versión anterior de este handler solo guardaba la primera
// sincronización y descartaba silenciosamente la segunda (bug real: el km
// final, combustible final y fotoCheckOutUrl del cierre nunca llegaban a
// persistirse). Ahora se actualiza (upsert) en cada sincronización, fusionando
// las fotos nuevas con las que ya se conocían.
const jornadasSincronizadas = new Map();

app.post(
  "/jornadas/sincronizar",
  exigirToken,
  upload.fields([
    { name: "fotoTacometroInicial", maxCount: 1 },
    { name: "fotoRuta", maxCount: 1 },
    { name: "fotoTacometroFinal", maxCount: 1 },
  ]),
  (req, res) => {
    const { idCliente, estado } = req.body;

    if (!idCliente) {
      return res.status(400).json({ mensaje: "Falta idCliente." });
    }

    const anterior = jornadasSincronizadas.get(idCliente);
    const fotosNuevas = construirUrlsFotos(req, req.files);
    const fotos = { ...(anterior?.fotos ?? {}), ...fotosNuevas };
    const jornada = { ...req.body, fotos, recibidaEn: new Date().toISOString() };
    jornadasSincronizadas.set(idCliente, jornada);

    if (!anterior) {
      console.log(`Jornada sincronizada (${estado}) -> idCliente=${idCliente}`, fotos);
      difundir({ tipo: "jornadaAbierta", jornada: { idCliente, ...jornada } });
    } else if (anterior.estado !== "cerrada" && estado === "cerrada") {
      console.log(`Jornada cerrada -> idCliente=${idCliente}`, fotos);
      difundir({ tipo: "jornadaCerrada", jornadaId: idCliente });
    } else {
      console.log(`Jornada re-sincronizada (sin cambio de estado) -> idCliente=${idCliente}`);
    }

    res.status(200).json({ idCliente, estado: "sincronizada", fotos });
  }
);

app.get("/jornadas", exigirToken, (req, res) => {
  const jornadas = Array.from(jornadasSincronizadas.entries()).map(([idCliente, jornada]) => ({
    idCliente,
    ...jornada,
  }));
  res.status(200).json(jornadas);
});

// ── Tracking GPS en tiempo real ─────────────────────────────────────────────
// jornadaId -> última posición conocida (para que un Dashboard que se conecta
// recién ahora pueda pintar el mapa sin esperar el próximo ping).
const ultimasPosiciones = new Map();

app.post("/tracking/ping", exigirToken, (req, res) => {
  const { choferId, jornadaIds, lat, lng, velocidadKmh, timestamp } = req.body ?? {};

  if (
    !choferId ||
    !Array.isArray(jornadaIds) ||
    jornadaIds.length === 0 ||
    typeof lat !== "number" ||
    typeof lng !== "number"
  ) {
    return res.status(400).json({ mensaje: "Faltan datos para registrar la posición." });
  }

  const choferNombre = jornadasSincronizadas.get(jornadaIds[0])?.choferNombre;
  const posicion = {
    tipo: "posicion",
    choferId,
    choferNombre,
    jornadaIds,
    lat,
    lng,
    velocidadKmh: velocidadKmh ?? null,
    timestamp: timestamp ?? new Date().toISOString(),
  };

  for (const jornadaId of jornadaIds) {
    ultimasPosiciones.set(jornadaId, posicion);
  }
  difundir(posicion);

  res.status(200).json({ recibido: true });
});

app.get("/tracking/ultimas-posiciones", exigirToken, (req, res) => {
  res.status(200).json(Array.from(ultimasPosiciones.values()));
});

// Sin exigirToken: la app móvil ya no tiene sesión con este servidor (usa
// Supabase Auth), y este endpoint es sin estado — recibe el arreglo de
// jornadas completo en el body, no lee nada propio del servidor.
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
const servidor = app.listen(PUERTO, () => {
  console.log(`Mock de auth escuchando en http://localhost:${PUERTO}`);
  console.log(`Chofer de prueba -> numeroEmpleado: 01  contrasena: 1234`);
  console.log(`WebSocket de tracking en ws://localhost:${PUERTO}/ws/tracking`);
});

// El servidor WS comparte el mismo puerto HTTP (mismo http.Server), en la
// ruta /ws/tracking. Es de solo lectura para el Dashboard: no procesa
// mensajes entrantes de los clientes, solo difunde posiciones/eventos.
const wss = new WebSocketServer({ server: servidor, path: "/ws/tracking" });
wss.on("connection", (socket) => {
  clientesWs.add(socket);
  socket.on("close", () => clientesWs.delete(socket));
});

module.exports = app;
