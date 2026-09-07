// Genera el reporte de jornadas en Excel y lo envía por correo. Usa una
// cuenta de prueba Ethereal (sin configuración) salvo que existan variables
// de entorno SMTP reales (SMTP_HOST, SMTP_USER, SMTP_PASS, [SMTP_PORT]).

const ExcelJS = require("exceljs");
const nodemailer = require("nodemailer");

let transportadorPromesa = null;

function obtenerTransportador() {
  if (transportadorPromesa) return transportadorPromesa;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transportadorPromesa = Promise.resolve(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    );
    return transportadorPromesa;
  }

  transportadorPromesa = nodemailer.createTestAccount().then((cuenta) =>
    nodemailer.createTransport({
      host: cuenta.smtp.host,
      port: cuenta.smtp.port,
      secure: cuenta.smtp.secure,
      auth: { user: cuenta.user, pass: cuenta.pass },
    })
  );
  return transportadorPromesa;
}

function formatearHora(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function formatearFecha(iso) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function calcularHorasTotales(fechaCheckIn, fechaCheckOut) {
  if (!fechaCheckOut) return "-";
  const horas = (new Date(fechaCheckOut).getTime() - new Date(fechaCheckIn).getTime()) / 3_600_000;
  return horas.toFixed(2);
}

function calcularKmRecorrido(kmInicial, kmFinal) {
  if (kmFinal == null) return "-";
  return Math.round(kmFinal - kmInicial);
}

// Hoy una jornada solo puede tener 0 o 1 incidencia (se captura una única vez
// al hacer check-out), pero esto se arma como arreglo para que, si en el
// futuro una jornada admite varias, las columnas de tipo/descripción/hora ya
// las muestren concatenadas por salto de línea sin tocar este archivo.
function obtenerIncidencias(jornada) {
  if (!jornada.tuvoIncidencia) return [];
  return [
    {
      tipo: jornada.tipoIncidencia || "N/A",
      detalle: jornada.detalleIncidencia || "N/A",
      hora: formatearHora(jornada.fechaCheckOut),
    },
  ];
}

const RELLENO_INCIDENCIA = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3D6" } };
const COLOR_TEXTO_INCIDENCIA = { argb: "FFE0A100" };
const COLOR_ENLACE = { argb: "FF0B5FFF" };

// Solo hipervínculo a la imagen (en el bucket público de Supabase Storage) —
// sin miniatura incrustada: evita descargar cada foto al generar el reporte,
// más rápido y liviano tanto para el servidor como para el archivo final.
const COLUMNAS_FOTO = [
  { campoUrl: "fotoCheckInUrl", claveLink: "urlFotoCheckIn", texto: "Ver foto Check-In ↗" },
  { campoUrl: "fotoRutaUrl", claveLink: "urlFotoRuta", texto: "Ver foto de Ruta ↗" },
  { campoUrl: "fotoCheckOutUrl", claveLink: "urlFotoCheckOut", texto: "Ver foto Check-Out ↗" },
];

// Google Maps URLs API (formato documentado, mismo que usa mapasService.ts
// en la app móvil) — no el legado `?q=`.
function urlGoogleMaps(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

const COLUMNAS_UBICACION = [
  { campoLat: "latInicial", campoLng: "lngInicial", clave: "ubicacionCheckIn" },
  { campoLat: "latFinal", campoLng: "lngFinal", clave: "ubicacionCheckOut" },
];

// A diferencia de las fotos de tacómetro/ruta (siempre 0 o 1), una incidencia
// puede tener un número variable de fotos de respaldo — Excel no soporta
// varios hipervínculos en una sola celda, así que se reservan 3 columnas fijas
// (cubre la enorme mayoría de los casos reales). Si una incidencia tiene más
// de 3, las siguientes no aparecen en el Excel (sí se ven todas, sin límite,
// en el detalle de jornada del Dashboard).
const MAX_FOTOS_INCIDENCIA_EXCEL = 3;

async function generarLibroExcel(jornadas) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Jornadas");

  hoja.columns = [
    { header: "N° Empleado", key: "idUsuario", width: 14 },
    { header: "Nombre del Chofer", key: "nombreChofer", width: 22 },
    { header: "Empresa", key: "empresa", width: 20 },
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Hora Check-In", key: "horaCheckIn", width: 13 },
    { header: "Hora Check-Out", key: "horaCheckOut", width: 13 },
    { header: "Horas Totales", key: "horasTotales", width: 13 },
    { header: "Ruta", key: "ruta", width: 20 },
    { header: "Matrícula", key: "matricula", width: 12 },
    { header: "Kilometraje Inicial", key: "kmInicial", width: 16 },
    { header: "Kilometraje Final", key: "kmFinal", width: 16 },
    { header: "Kilometraje Total Recorrido", key: "kmRecorrido", width: 20 },
    { header: "Nivel Combustible Inicial", key: "combustibleInicial", width: 18 },
    { header: "Nivel Combustible Final", key: "combustibleFinal", width: 18 },
    { header: "¿Tiene Incidencias?", key: "tieneIncidencias", width: 16 },
    { header: "Tipo de Incidencia", key: "tipoIncidencia", width: 20 },
    { header: "Descripción de Incidencia", key: "descripcionIncidencia", width: 32 },
    { header: "Hora Incidencia", key: "horaIncidencia", width: 14 },
    { header: "Foto Check-In", key: "urlFotoCheckIn", width: 20 },
    { header: "Foto Ruta", key: "urlFotoRuta", width: 20 },
    { header: "Foto Check-Out", key: "urlFotoCheckOut", width: 20 },
    { header: "Ubicación Check-In", key: "ubicacionCheckIn", width: 16 },
    { header: "Ubicación Check-Out", key: "ubicacionCheckOut", width: 16 },
    ...Array.from({ length: MAX_FOTOS_INCIDENCIA_EXCEL }, (_, i) => ({
      header: `Foto Incidencia ${i + 1}`,
      key: `fotoIncidencia${i + 1}`,
      width: 20,
    })),
  ];
  hoja.getRow(1).font = { bold: true };

  for (const jornada of jornadas) {
    const incidencias = obtenerIncidencias(jornada);
    const tieneIncidencias = incidencias.length > 0;

    const fila = hoja.addRow({
      idUsuario: jornada.choferNumeroEmpleado ?? jornada.choferId,
      nombreChofer: jornada.choferNombre,
      empresa: jornada.empresa,
      fecha: formatearFecha(jornada.fechaCheckIn),
      horaCheckIn: formatearHora(jornada.fechaCheckIn),
      horaCheckOut: formatearHora(jornada.fechaCheckOut),
      horasTotales: calcularHorasTotales(jornada.fechaCheckIn, jornada.fechaCheckOut),
      ruta: jornada.ruta,
      matricula: jornada.matricula,
      kmInicial: jornada.kmInicial,
      kmFinal: jornada.kmFinal ?? "-",
      kmRecorrido: calcularKmRecorrido(jornada.kmInicial, jornada.kmFinal),
      combustibleInicial: `${jornada.combustibleInicial}%`,
      combustibleFinal: jornada.combustibleFinal != null ? `${jornada.combustibleFinal}%` : "N/A",
      tieneIncidencias: tieneIncidencias ? "SÍ" : "NO",
      tipoIncidencia: tieneIncidencias ? incidencias.map((i) => i.tipo).join("\n") : "N/A",
      descripcionIncidencia: tieneIncidencias ? incidencias.map((i) => i.detalle).join("\n") : "N/A",
      horaIncidencia: tieneIncidencias ? incidencias.map((i) => i.hora).join("\n") : "N/A",
    });

    if (tieneIncidencias) {
      fila.getCell("tieneIncidencias").fill = RELLENO_INCIDENCIA;
      fila.getCell("tieneIncidencias").font = { bold: true, color: COLOR_TEXTO_INCIDENCIA };
      ["tipoIncidencia", "descripcionIncidencia", "horaIncidencia"].forEach((clave) => {
        fila.getCell(clave).alignment = { wrapText: true, vertical: "top" };
      });
    }

    for (const { campoUrl, claveLink, texto } of COLUMNAS_FOTO) {
      const url = jornada[campoUrl];
      if (url) {
        fila.getCell(claveLink).value = {
          text: texto,
          hyperlink: url,
          tooltip: "Haz clic para ver la imagen en alta resolución",
        };
        fila.getCell(claveLink).font = { color: COLOR_ENLACE, underline: true };
      } else {
        fila.getCell(claveLink).value = "-";
      }
    }

    for (const { campoLat, campoLng, clave } of COLUMNAS_UBICACION) {
      const lat = jornada[campoLat];
      const lng = jornada[campoLng];
      if (lat != null && lng != null) {
        fila.getCell(clave).value = {
          text: "Ver en Mapa",
          hyperlink: urlGoogleMaps(lat, lng),
          tooltip: "Haz clic para abrir la ubicación exacta en Google Maps",
        };
        fila.getCell(clave).font = { color: COLOR_ENLACE, underline: true };
      } else {
        fila.getCell(clave).value = "N/A";
      }
    }

    const fotosIncidencia = jornada.fotosIncidencia ?? [];
    for (let i = 0; i < MAX_FOTOS_INCIDENCIA_EXCEL; i++) {
      const clave = `fotoIncidencia${i + 1}`;
      const url = fotosIncidencia[i];
      if (url) {
        fila.getCell(clave).value = {
          text: `Ver Foto ${i + 1} ↗`,
          hyperlink: url,
          tooltip: "Haz clic para ver la imagen en alta resolución",
        };
        fila.getCell(clave).font = { color: COLOR_ENLACE, underline: true };
      } else {
        fila.getCell(clave).value = "-";
      }
    }
  }

  return libro.xlsx.writeBuffer();
}

function construirHtmlCorreo(rangoInicio, rangoFin, cantidadJornadas) {
  return `
    <div style="font-family: Arial, sans-serif; color: #1A1F29;">
      <h2 style="color: #0B5FFF;">Tu reporte está listo</h2>
      <p>Adjunto encontrarás el reporte de jornadas del <strong>${rangoInicio}</strong> al <strong>${rangoFin}</strong>.</p>
      <p>Total de jornadas incluidas: <strong>${cantidadJornadas}</strong>.</p>
    </div>
  `;
}

const NOMBRE_ARCHIVO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Render bloquea el tráfico saliente a los puertos SMTP (25/465/587) en
// servicios del plan free (ver changelog de Render, sept. 2025) — eso incluye
// tanto un SMTP real como el fallback de Ethereal de abajo, que también habla
// SMTP puro. Por eso el envío en producción pasa por la API HTTPS de Resend
// (puerto 443, no bloqueado) cuando está configurada; el camino de
// nodemailer/Ethereal se conserva solo para desarrollo local, donde SMTP sí
// funciona sin restricciones.
//
// ⚠️ Sin un dominio propio verificado en Resend, el remitente queda fijo en
// resend.dev y Resend solo entrega a la MISMA casilla con la que se creó la
// cuenta (403 para cualquier otro destinatario) — el campo "Correo de
// destino" del Dashboard solo funciona si coincide con esa casilla. Verificar
// un dominio propio (registros DNS) levanta esa restricción.
async function enviarPorResend({ correo, rangoInicio, rangoFin, jornadas, buffer }) {
  const payload = {
    from: process.env.RESEND_FROM_EMAIL || "Control de Jornada <onboarding@resend.dev>",
    to: [correo],
    subject: `Reporte de jornadas (${rangoInicio} a ${rangoFin})`,
    html: construirHtmlCorreo(rangoInicio, rangoFin, jornadas.length),
    attachments: [
      {
        content: buffer.toString("base64"),
        filename: `reporte-jornadas-${rangoInicio}-a-${rangoFin}.xlsx`,
      },
    ],
  };

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`Resend respondió ${respuesta.status} ${respuesta.statusText}: ${detalle}`);
  }
}

async function enviarPorSmtp({ correo, rangoInicio, rangoFin, jornadas, buffer }) {
  const transportador = await obtenerTransportador();

  const info = await transportador.sendMail({
    from: '"Control de Jornada" <reportes@app-transp.local>',
    to: correo,
    subject: `Reporte de jornadas (${rangoInicio} a ${rangoFin})`,
    html: construirHtmlCorreo(rangoInicio, rangoFin, jornadas.length),
    attachments: [
      {
        filename: `reporte-jornadas-${rangoInicio}-a-${rangoFin}.xlsx`,
        content: buffer,
        contentType: NOMBRE_ARCHIVO_XLSX,
      },
    ],
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  return previewUrl ? { previewUrl } : {};
}

async function generarYEnviarReporte({ correo, rangoInicio, rangoFin, jornadas }) {
  const buffer = await generarLibroExcel(jornadas);

  if (process.env.RESEND_API_KEY) {
    await enviarPorResend({ correo, rangoInicio, rangoFin, jornadas, buffer });
    return {};
  }

  return enviarPorSmtp({ correo, rangoInicio, rangoFin, jornadas, buffer });
}

module.exports = { generarYEnviarReporte };
