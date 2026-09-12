import type { PuntoRuta } from "@/lib/types";

// Cliente del lado del navegador para la API pública de OSRM (Open Source
// Routing Machine) — ajusta una secuencia de pings de GPS a las calles reales
// en vez de dibujar líneas rectas entre puntos.
//
// ⚠️ router.project-osrm.org es el **servidor demo público** de OSRM, no un
// servicio contratado por el proyecto: es gratis, sin API key, pero según su
// propia política de uso es para pruebas/uso liviano, no para tráfico de
// producción sostenido — puede aplicar rate-limiting o quedar caído sin
// aviso. Si el trazado por calles se vuelve una función central del
// Dashboard (no solo una mejora visual ocasional), lo correcto sería alojar
// una instancia propia de OSRM o contratar un proveedor (Mapbox Directions,
// Google Roads, etc.). Por eso todo este archivo tiene un fallback: si OSRM
// falla, quien lo llama debe caer a la línea recta entre los pings crudos
// (ver useRutaJornada).
//
// ⚠️ **Corrección (encontrada en el piloto con choferes reales)**: este
// archivo usaba el servicio `/route` de OSRM, que calcula la ruta "óptima"
// entre los puntos que recibe tratándolos como paradas deliberadas — no como
// una traza de GPS a reconstruir. Con pings espaciados (~20s, GPS
// best-effort sin cola de reintentos, ver trackingService.ts de la app
// móvil), `/route` terminaba dibujando el camino que OSRM considera más
// corto/rápido entre esos puntos, que en el piloto no coincidió con la calle
// real que tomó el chofer. `/match` (Map Matching) es el servicio de OSRM
// hecho para este caso: ajusta una secuencia de puntos GPS al camino más
// probable que el vehículo siguió, usando el horario de cada punto y un
// margen de error de precisión.

const OSRM_BASE_URL = "https://router.project-osrm.org/match/v1/driving";

// Sin esto, un servidor demo colgado (no caído — colgado, sin responder)
// deja el fetch pendiente para siempre y con él la query de TanStack Query en
// loading eterno, nunca llega al catch que activa el fallback de línea recta
// en useRutaJornada. Con el timeout, un cuelgue se comporta igual que
// cualquier otro fallo de OSRM: aborta, tira error, cae al fallback.
const TIMEOUT_MS = 8000;

// El límite real es el largo de la URL (las coordenadas van en el path, no
// en el body) — cada par "lng,lat;" ronda 20-24 caracteres con 5 decimales
// de precisión (~1m de resolución, de sobra para pings de GPS). 100 puntos
// da una URL de ~2200 caracteres, dentro de límites típicos de servidor/
// navegador con margen. Si hay más, se muestrea parejo conservando siempre
// el primer y el último punto (para no perder inicio/fin del trayecto).
const MAX_PUNTOS_OSRM = 100;

// `ubicaciones_tracking`/`ubicaciones_tracking_planas` no guardan la
// precisión real del GPS de cada ping (no existe esa columna) — se usa un
// radio fijo generoso para todos los puntos en vez de sumar tracking de
// precisión real en esta iteración. `/match` lo usa como margen de error
// tolerado al buscar a qué calle pertenece cada ping.
const RADIO_GPS_METROS = 25;

function muestrear<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;

  const paso = (items.length - 1) / (max - 1);
  const muestreados: T[] = [];
  for (let i = 0; i < max; i++) {
    muestreados.push(items[Math.round(i * paso)]);
  }
  return muestreados;
}

interface MatchingOSRM {
  geometry: { coordinates: [number, number][] };
}

interface RespuestaOSRMMatch {
  code: string;
  matchings?: MatchingOSRM[];
}

/**
 * Recibe pings de GPS (con `lat`/`lng`/`timestamp`, tal como los devuelve
 * `/api/tracking/ruta-jornada`) y devuelve el trazado ajustado a las calles
 * como `[lat, lng]` — el orden que usa el resto de este proyecto (Leaflet,
 * PosicionChofer, etc.), listo para `<Polyline positions=.../>`. La
 * conversión a `lng,lat` (lo que exige la URL de OSRM) y de vuelta a
 * `lat,lng` (lo que devuelve el GeoJSON de la respuesta) queda encapsulada
 * acá — quien llama nunca maneja el orden invertido.
 *
 * Tira un error si OSRM no responde o no puede ajustar la ruta — es
 * responsabilidad de quien llama decidir el fallback (ver useRutaJornada).
 */
export async function getOSRMRoute(pings: PuntoRuta[]): Promise<[number, number][]> {
  if (pings.length < 2) {
    throw new Error("Se necesitan al menos 2 puntos para calcular una ruta.");
  }

  const muestreados = muestrear(pings, MAX_PUNTOS_OSRM);
  const coordenadasUrl = muestreados.map((p) => `${p.lng},${p.lat}`).join(";");
  const timestampsUrl = muestreados
    .map((p) => Math.floor(new Date(p.timestamp).getTime() / 1000))
    .join(";");
  const radiusesUrl = muestreados.map(() => RADIO_GPS_METROS).join(";");

  const respuesta = await fetch(
    `${OSRM_BASE_URL}/${coordenadasUrl}` +
      `?geometries=geojson&overview=full` +
      `&timestamps=${timestampsUrl}&radiuses=${radiusesUrl}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  );

  if (!respuesta.ok) {
    throw new Error(`OSRM respondió ${respuesta.status}.`);
  }

  const cuerpo = (await respuesta.json()) as RespuestaOSRMMatch;

  if (cuerpo.code !== "Ok" || !cuerpo.matchings?.length) {
    throw new Error(`OSRM no pudo ajustar la ruta (code: ${cuerpo.code}).`);
  }

  // `/match` puede partir el trayecto en varios `matchings` cuando hay un
  // salto de más de 60s entre dos pings consecutivos, o una transición poco
  // plausible entre ellos (cada uno trae su propia geometría). No hace falta
  // unir los tramos con nada especial: `<Polyline>` ya dibuja una línea recta
  // entre cada par de puntos consecutivos del arreglo `positions`, así que
  // concatenar las geometrías en orden conecta el final de un tramo con el
  // inicio del siguiente exactamente con el mismo criterio que ya usa este
  // archivo como fallback cuando OSRM falla del todo.
  return cuerpo.matchings.flatMap((matching) =>
    matching.geometry.coordinates.map(([lng, lat]): [number, number] => [lat, lng])
  );
}
