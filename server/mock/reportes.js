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

// timeZone fijo: Render corre en UTC, así que sin esto las horas del Excel
// quedaban en UTC en vez de en la hora real de España en la que el chofer
// hizo check-in/check-out (Hallazgo #17) — mismo criterio que el rango de
// fechas del reporte, que ya se interpreta siempre en Europe/Madrid.
const ZONA_ESPANA = "Europe/Madrid";

// Excel guarda una fecha/hora como un NÚMERO — días desde el 30/12/1899,
// con la hora como fracción de ese día — sin ninguna zona horaria propia.
// Si se le entrega un objeto Date a la librería y se deja que ella decida
// cómo convertirlo, lo más probable es que use UTC o la zona del proceso
// (en Render, UTC): reintroduciría el Hallazgo #17 por la puerta de atrás,
// esta vez sin AM/PM que lo delate (se vería "07:30" en vez de "09:30", con
// pinta de dato correcto). El número se arma a mano a partir de los
// COMPONENTES de reloj de pared en Madrid — Date.UTC acá es solo una
// calculadora de días, nunca una zona horaria (Hallazgo #19).
const EPOCH_EXCEL = Date.UTC(1899, 11, 30);
const MS_POR_DIA = 86_400_000;
const FORMATO_FECHA_EXCEL = "dd/mm/yyyy";
const FORMATO_HORA_EXCEL = "hh:mm";
// Los corchetes en [h] no son decorativos: con "h:mm" a secas, una suma que
// pase de 24 horas vuelve a cero (25:30 se muestra "01:30"); con "[h]:mm"
// acumula sin dar la vuelta, que es lo que hace falta al totalizar una
// semana o un mes en Excel.
const FORMATO_DURACION_EXCEL = "[h]:mm";

// Mismo mecanismo del Hallazgo #17 (Intl con timeZone explícito), pero acá
// hacen falta los componentes sueltos (año/mes/día/hora/minuto/segundo) en
// vez de una cadena ya formateada, porque hay que construir un número, no
// texto.
function componentesEnEspana(iso) {
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_ESPANA,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const partes = Object.fromEntries(
    formateador.formatToParts(new Date(iso)).map(({ type, value }) => [type, value])
  );
  return {
    anio: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
    segundo: Number(partes.second),
  };
}

/** Serial de fecha de Excel (sin parte de hora) — columna "Fecha". */
function serialFechaExcel(iso) {
  const { anio, mes, dia } = componentesEnEspana(iso);
  return (Date.UTC(anio, mes - 1, dia) - EPOCH_EXCEL) / MS_POR_DIA;
}

/** Fracción de día (0 a 1) — columnas de hora del día (Check-In/Check-Out/Incidencia). */
function fraccionHoraExcel(iso) {
  const { hora, minuto, segundo } = componentesEnEspana(iso);
  return (hora * 3600 + minuto * 60 + segundo) / 86400;
}

// Devuelve la duración en HORAS decimales (no un string ya formateado) —
// quien arma la celda la convierte a fracción de día (÷24) sin volver a
// parsear texto. null cuando la jornada sigue abierta (sin check-out).
function calcularHorasTotales(fechaCheckIn, fechaCheckOut) {
  if (!fechaCheckOut) return null;
  return (new Date(fechaCheckOut).getTime() - new Date(fechaCheckIn).getTime()) / 3_600_000;
}

function calcularKmRecorrido(kmInicial, kmFinal) {
  if (kmFinal == null) return "-";
  return Math.round(kmFinal - kmInicial);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// rangoInicio/rangoFin ya son días de calendario "YYYY-MM-DD" (no un
// instante) — reordenar nomás, sin ninguna conversión de zona horaria.
function formatearFechaLegible(fechaIso) {
  const [anio, mes, dia] = fechaIso.split("-");
  return `${dia}/${mes}/${anio}`;
}

// A diferencia de lo de arriba, ESTE sí es un instante real ("ahora") — usa
// componentesEnEspana() (mismo mecanismo Intl+timeZone de siempre) para
// mostrar la hora de generación en hora de España, no la del proceso.
function formatearFechaHoraLegible(instanteIso) {
  const { anio, mes, dia, hora, minuto } = componentesEnEspana(instanteIso);
  return `${pad2(dia)}/${pad2(mes)}/${anio} ${pad2(hora)}:${pad2(minuto)}`;
}

// rangoInicio/rangoFin son opcionales desde el Hallazgo #21 ("sin fecha" =
// sin límite de ese lado, igual que la tabla del Dashboard) — este texto es
// lo que declara qué rango se aplicó de verdad, en el correo y en la hoja
// de filtros del Excel.
function describirRangoFechas(rangoInicio, rangoFin) {
  if (rangoInicio && rangoFin) {
    return `${formatearFechaLegible(rangoInicio)} a ${formatearFechaLegible(rangoFin)}`;
  }
  if (rangoInicio) return `Desde ${formatearFechaLegible(rangoInicio)}`;
  if (rangoFin) return `Hasta ${formatearFechaLegible(rangoFin)}`;
  return "Todas las fechas";
}

// Mismo criterio que describirRangoFechas() pero para el nombre de archivo
// (sin espacios/acentos, y sin que quede literalmente "undefined" si algún
// extremo del rango falta).
function tokenArchivoRango(rangoInicio, rangoFin) {
  if (rangoInicio && rangoFin) return `${rangoInicio}-a-${rangoFin}`;
  if (rangoInicio) return `desde-${rangoInicio}`;
  if (rangoFin) return `hasta-${rangoFin}`;
  return "todas-las-fechas";
}

const ESTADOS_LEGIBLES = { abierta: "Abierta", cerrada: "Cerrada" };

// Segunda hoja del libro (nunca filas por encima de los datos — el
// Hallazgo #19 recién convirtió la hoja de datos en valores reales
// justamente para que se pueda ordenar/llevar a una tabla dinámica sin que
// nada estorbe arriba): declara con qué filtros se generó el reporte, para
// que "la tabla decía 18 y el archivo trajo 8" sea visible ABRIENDO EL
// PROPIO ARCHIVO, no solo confiando en que el Dashboard mandó lo correcto
// (Hallazgo #21).
function agregarHojaFiltros(libro, { rangoInicio, rangoFin, empresa, chofer, estado, totalJornadas }) {
  const hoja = libro.addWorksheet("Filtros");
  hoja.columns = [
    { header: "Campo", key: "campo", width: 22 },
    { header: "Valor", key: "valor", width: 40 },
  ];
  hoja.getRow(1).font = { bold: true };

  hoja.addRows([
    { campo: "Rango de fechas", valor: describirRangoFechas(rangoInicio, rangoFin) },
    { campo: "Empresa", valor: empresa || "Todas" },
    { campo: "Chofer", valor: chofer || "Todos" },
    { campo: "Estado", valor: ESTADOS_LEGIBLES[estado] || "Todos" },
    { campo: "Generado el", valor: formatearFechaHoraLegible(new Date().toISOString()) },
    { campo: "Total de jornadas", valor: totalJornadas },
  ]);
}

// spec_incidencia_en_checkin.md: una jornada puede tener 0, 1 o 2 incidencias
// estructuradas — una de check-in y otra de check-out, independientes entre
// sí — así que cada etapa se resuelve por separado en vez de un único
// arreglo. "horaIso" queda como el ISO crudo (no una cadena ya formateada) a
// propósito: quien arma la fila la convierte a número de Excel.
//
// Check-in tiene además un caso histórico (§4 del spec): jornadas creadas
// antes de este spec solo tienen el campo de texto libre `incidencias`, sin
// tipo ni hora propia. Se muestra ese texto en la columna de descripción sin
// inventar un tipo, y `estructurada: false` hace que la columna "¿Incidencia
// Check-In?" NO se marque "SÍ" para ese caso — mismo criterio que el
// Dashboard, donde el badge de incidencia solo aparece para datos
// estructurados (ver jornada-detalle-dialog.tsx).
function obtenerIncidenciaCheckIn(jornada) {
  if (jornada.tuvoIncidenciaCheckin) {
    return {
      estructurada: true,
      tipo: jornada.tipoIncidenciaCheckin || "N/A",
      detalle: jornada.detalleIncidenciaCheckin || "N/A",
      horaIso: jornada.fechaCheckIn,
    };
  }
  if (jornada.incidencias) {
    return {
      estructurada: false,
      tipo: null,
      detalle: jornada.incidencias,
      horaIso: jornada.fechaCheckIn,
    };
  }
  return null;
}

function obtenerIncidenciaCheckOut(jornada) {
  if (!jornada.tuvoIncidencia) return null;
  return {
    estructurada: true,
    tipo: jornada.tipoIncidencia || "N/A",
    detalle: jornada.detalleIncidencia || "N/A",
    horaIso: jornada.fechaCheckOut,
  };
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

async function generarLibroExcel(jornadas, filtros) {
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
    // spec_incidencia_en_checkin.md §3.8: dos secciones paralelas (Check-In / Check-Out) en vez de
    // la única sección de antes — cada etapa es independiente y necesita su propia hora, que no
    // puede compartirse en una sola celda numérica.
    { header: "¿Incidencia Check-In?", key: "tieneIncidenciaCheckIn", width: 18 },
    { header: "Tipo Incidencia Check-In", key: "tipoIncidenciaCheckIn", width: 20 },
    { header: "Descripción Incidencia Check-In", key: "descripcionIncidenciaCheckIn", width: 32 },
    { header: "Hora Incidencia Check-In", key: "horaIncidenciaCheckIn", width: 16 },
    { header: "¿Incidencia Check-Out?", key: "tieneIncidenciaCheckOut", width: 18 },
    { header: "Tipo Incidencia Check-Out", key: "tipoIncidenciaCheckOut", width: 20 },
    { header: "Descripción Incidencia Check-Out", key: "descripcionIncidenciaCheckOut", width: 32 },
    { header: "Hora Incidencia Check-Out", key: "horaIncidenciaCheckOut", width: 16 },
    { header: "Foto Check-In", key: "urlFotoCheckIn", width: 20 },
    { header: "Foto Ruta", key: "urlFotoRuta", width: 20 },
    { header: "Foto Check-Out", key: "urlFotoCheckOut", width: 20 },
    { header: "Ubicación Check-In", key: "ubicacionCheckIn", width: 16 },
    { header: "Ubicación Check-Out", key: "ubicacionCheckOut", width: 16 },
    ...Array.from({ length: MAX_FOTOS_INCIDENCIA_EXCEL }, (_, i) => ({
      header: `Foto Incidencia Check-In ${i + 1}`,
      key: `fotoIncidenciaCheckIn${i + 1}`,
      width: 20,
    })),
    ...Array.from({ length: MAX_FOTOS_INCIDENCIA_EXCEL }, (_, i) => ({
      header: `Foto Incidencia Check-Out ${i + 1}`,
      key: `fotoIncidenciaCheckOut${i + 1}`,
      width: 20,
    })),
  ];
  hoja.getRow(1).font = { bold: true };

  for (const jornada of jornadas) {
    const incidenciaCheckIn = obtenerIncidenciaCheckIn(jornada);
    const incidenciaCheckOut = obtenerIncidenciaCheckOut(jornada);
    const horasTotalesNumero = calcularHorasTotales(jornada.fechaCheckIn, jornada.fechaCheckOut);

    const fila = hoja.addRow({
      idUsuario: jornada.choferNumeroEmpleado ?? jornada.choferId,
      nombreChofer: jornada.choferNombre,
      empresa: jornada.empresa,
      fecha: serialFechaExcel(jornada.fechaCheckIn),
      horaCheckIn: fraccionHoraExcel(jornada.fechaCheckIn),
      horaCheckOut: jornada.fechaCheckOut ? fraccionHoraExcel(jornada.fechaCheckOut) : "-",
      // Minutos totales ÷ 1440 = horas decimales ÷ 24 (mismo cálculo, ya
      // partiendo del número de horas que devuelve calcularHorasTotales en
      // vez de reconstruirlo).
      horasTotales: horasTotalesNumero != null ? horasTotalesNumero / 24 : "-",
      ruta: jornada.ruta,
      matricula: jornada.matricula,
      kmInicial: jornada.kmInicial,
      kmFinal: jornada.kmFinal ?? "-",
      kmRecorrido: calcularKmRecorrido(jornada.kmInicial, jornada.kmFinal),
      combustibleInicial: `${jornada.combustibleInicial}%`,
      combustibleFinal: jornada.combustibleFinal != null ? `${jornada.combustibleFinal}%` : "N/A",
      tieneIncidenciaCheckIn: incidenciaCheckIn?.estructurada ? "SÍ" : "NO",
      tipoIncidenciaCheckIn: incidenciaCheckIn ? (incidenciaCheckIn.tipo ?? "N/A") : "N/A",
      descripcionIncidenciaCheckIn: incidenciaCheckIn ? incidenciaCheckIn.detalle : "N/A",
      horaIncidenciaCheckIn: incidenciaCheckIn ? fraccionHoraExcel(incidenciaCheckIn.horaIso) : "N/A",
      tieneIncidenciaCheckOut: incidenciaCheckOut ? "SÍ" : "NO",
      tipoIncidenciaCheckOut: incidenciaCheckOut ? incidenciaCheckOut.tipo : "N/A",
      descripcionIncidenciaCheckOut: incidenciaCheckOut ? incidenciaCheckOut.detalle : "N/A",
      horaIncidenciaCheckOut: incidenciaCheckOut ? fraccionHoraExcel(incidenciaCheckOut.horaIso) : "N/A",
    });

    // numFmt solo en las celdas que de verdad llevan un número — aplicarlo
    // sobre el "-"/"N/A" de texto no rompe nada (Excel lo ignora en una
    // celda de texto), pero declararlo solo donde corresponde es más claro.
    fila.getCell("fecha").numFmt = FORMATO_FECHA_EXCEL;
    fila.getCell("horaCheckIn").numFmt = FORMATO_HORA_EXCEL;
    if (jornada.fechaCheckOut) fila.getCell("horaCheckOut").numFmt = FORMATO_HORA_EXCEL;
    if (horasTotalesNumero != null) fila.getCell("horasTotales").numFmt = FORMATO_DURACION_EXCEL;
    if (incidenciaCheckIn) fila.getCell("horaIncidenciaCheckIn").numFmt = FORMATO_HORA_EXCEL;
    if (incidenciaCheckOut) fila.getCell("horaIncidenciaCheckOut").numFmt = FORMATO_HORA_EXCEL;

    // El resaltado (relleno/negrita) de "¿Incidencia...?" solo se aplica cuando es una incidencia
    // ESTRUCTURADA de verdad — el histórico de texto libre (§4 del spec) no la activa, mismo
    // criterio que el badge del Dashboard. El wrap de texto sí aplica para cualquier contenido
    // (estructurado o histórico), porque ambos pueden ser texto largo.
    if (incidenciaCheckIn?.estructurada) {
      fila.getCell("tieneIncidenciaCheckIn").fill = RELLENO_INCIDENCIA;
      fila.getCell("tieneIncidenciaCheckIn").font = { bold: true, color: COLOR_TEXTO_INCIDENCIA };
    }
    if (incidenciaCheckIn) {
      ["tipoIncidenciaCheckIn", "descripcionIncidenciaCheckIn"].forEach((clave) => {
        fila.getCell(clave).alignment = { wrapText: true, vertical: "top" };
      });
    }

    if (incidenciaCheckOut) {
      fila.getCell("tieneIncidenciaCheckOut").fill = RELLENO_INCIDENCIA;
      fila.getCell("tieneIncidenciaCheckOut").font = { bold: true, color: COLOR_TEXTO_INCIDENCIA };
      ["tipoIncidenciaCheckOut", "descripcionIncidenciaCheckOut"].forEach((clave) => {
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

    const fotosIncidenciaCheckIn = jornada.fotosIncidenciaCheckin ?? [];
    for (let i = 0; i < MAX_FOTOS_INCIDENCIA_EXCEL; i++) {
      const clave = `fotoIncidenciaCheckIn${i + 1}`;
      const url = fotosIncidenciaCheckIn[i];
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

    const fotosIncidenciaCheckOut = jornada.fotosIncidencia ?? [];
    for (let i = 0; i < MAX_FOTOS_INCIDENCIA_EXCEL; i++) {
      const clave = `fotoIncidenciaCheckOut${i + 1}`;
      const url = fotosIncidenciaCheckOut[i];
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

  agregarHojaFiltros(libro, { ...filtros, totalJornadas: jornadas.length });

  return libro.xlsx.writeBuffer();
}

function construirHtmlCorreo(rangoInicio, rangoFin, cantidadJornadas) {
  return `
    <div style="font-family: Arial, sans-serif; color: #1A1F29;">
      <h2 style="color: #0B5FFF;">Tu reporte está listo</h2>
      <p>Adjunto encontrarás el reporte de jornadas — ${describirRangoFechas(rangoInicio, rangoFin)}.</p>
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
    subject: `Reporte de jornadas (${describirRangoFechas(rangoInicio, rangoFin)})`,
    html: construirHtmlCorreo(rangoInicio, rangoFin, jornadas.length),
    attachments: [
      {
        content: buffer.toString("base64"),
        filename: `reporte-jornadas-${tokenArchivoRango(rangoInicio, rangoFin)}.xlsx`,
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
    subject: `Reporte de jornadas (${describirRangoFechas(rangoInicio, rangoFin)})`,
    html: construirHtmlCorreo(rangoInicio, rangoFin, jornadas.length),
    attachments: [
      {
        filename: `reporte-jornadas-${tokenArchivoRango(rangoInicio, rangoFin)}.xlsx`,
        content: buffer,
        contentType: NOMBRE_ARCHIVO_XLSX,
      },
    ],
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  return previewUrl ? { previewUrl } : {};
}

async function generarYEnviarReporte({ correo, rangoInicio, rangoFin, empresa, chofer, estado, jornadas }) {
  const buffer = await generarLibroExcel(jornadas, { rangoInicio, rangoFin, empresa, chofer, estado });

  if (process.env.RESEND_API_KEY) {
    await enviarPorResend({ correo, rangoInicio, rangoFin, jornadas, buffer });
    return {};
  }

  return enviarPorSmtp({ correo, rangoInicio, rangoFin, jornadas, buffer });
}

module.exports = { generarYEnviarReporte };
