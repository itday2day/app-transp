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

// ⚠️ **Corrección (regresión del cambio /route → /match, encontrada en el
// piloto)**: este valor era 100, calibrado para el límite de **largo de
// URL** de `/route` (que sí tolera cientos de coordenadas). `/match` es un
// servicio bastante más pesado de calcular (corre un Hidden Markov Model
// sobre la traza), y el servidor demo público de OSRM le impone un límite
// de **cantidad de puntos** mucho más chico e independiente del largo de la
// URL: confirmado a mano contra `router.project-osrm.org/match` que 10
// puntos responde `Ok`, pero 11 ya responde
// `400 {"code":"TooBig","message":"Too many trace coordinates"}` — sin
// relación con qué tan separados estén entre sí. Con el valor viejo (100),
// **casi cualquier jornada real** (más de ~3 minutos de tracking a un ping
// cada ~20s) terminaba mandando más de 10 puntos, `/match` rechazaba la
// petición, y el código caía silenciosamente al fallback de línea recta
// entre pings crudos — exactamente el síntoma reportado ("la ruta atraviesa
// edificios, como una línea recta entre pocos puntos"): en la práctica,
// *siempre* se estaba usando el fallback, nunca el ajuste a calles. Este
// límite no está documentado en la API pública de OSRM (no es parte del
// protocolo Map Matching en sí, sino de la configuración `--max-matching-
// size` de esta instancia demo en particular) y podría cambiar sin aviso —
// si en el futuro empieza a fallar de nuevo con `TooBig`, hay que volver a
// probarlo a mano y ajustar este número, no asumir que 10 es un límite fijo
// de OSRM.
const MAX_PUNTOS_OSRM = 10;

// ⚠️ **Trazado por tramos (encontrado en el piloto, tercera corrección sobre
// este archivo)**: el límite de 10 puntos de arriba es real y no se puede
// subir — pero antes de esta corrección, `getOSRMRoute` lo aplicaba
// muestreando **todo** el trayecto a esos 10 puntos en una sola llamada a
// `/match`. Con una jornada larga (varios minutos, varias calles), esos 10
// puntos quedaban muy espaciados entre sí: `/match` respondía `code: "Ok"`
// sin ningún error, pero el resultado era una aproximación gruesa — la
// dirección general era correcta, pero se perdían las vueltas y calles
// intermedias entre esos 10 puntos (a diferencia de `TooBig`/`NoMatch`, acá
// no había ningún error que avisara del problema).
//
// La solución no es subir `MAX_PUNTOS_OSRM` (sigue siendo el límite real por
// llamada) sino partir el trayecto en varios **tramos** de hasta
// `MAX_PUNTOS_OSRM` puntos cada uno, con 1 punto de solapamiento entre
// tramos consecutivos (el último de un tramo es el primero del siguiente,
// para no dejar un salto visual en cada límite de tramo), y llamar a
// `/match` una vez por tramo, en secuencia. `MAX_PUNTOS_OSRM` y
// `OSRM_MAX_TRAMOS` son dos límites relacionados pero distintos: uno es
// cuántos puntos tolera el servidor **por llamada**, el otro es cuántas
// llamadas secuenciales estamos dispuestos a hacerle **nosotros** al mismo
// servidor demo público para una sola jornada, para no convertir "ver una
// ruta" en decenas de requests a un servicio gratuito compartido.
const OSRM_MAX_TRAMOS = 15;

// Con tramos de MAX_PUNTOS_OSRM puntos y 1 de solapamiento, cada tramo aporta
// (MAX_PUNTOS_OSRM - 1) pings nuevos + 1 heredado del tramo anterior — salvo
// el primero, que aporta los MAX_PUNTOS_OSRM completos. De ahí el +1 al
// final: con los valores actuales, 15 × 9 + 1 = 136 pings reales por
// trazado sin descartar ninguno (~13x más detalle que el límite viejo de 10
// puntos totales). Si una jornada tiene más pings que esto, se degrada con
// el mismo muestreo uniforme que ya existía — no se descarta el trazado,
// solo se lo aproxima un poco más.
const MAX_PUNTOS_TOTAL = OSRM_MAX_TRAMOS * (MAX_PUNTOS_OSRM - 1) + 1;

// `ubicaciones_tracking`/`ubicaciones_tracking_planas` no guardan la
// precisión real del GPS de cada ping (no existe esa columna) — se usa un
// radio fijo generoso para todos los puntos en vez de sumar tracking de
// precisión real en esta iteración. `/match` lo usa como margen de error
// tolerado al buscar a qué calle pertenece cada ping.
const RADIO_GPS_METROS = 25;

// ⚠️ **Corrección (segunda regresión encontrada en el piloto, después del fix
// de MAX_PUNTOS_OSRM)**: `ubicaciones_tracking` puede tener pings duplicados
// exactos (mismo lat/lng/timestamp repetido varias veces — confirmado en una
// jornada real de prueba: 9 filas guardadas, pero solo 3 posiciones/horarios
// realmente distintos, el resto eran copias bit a bit de esas tres). Esos
// duplicados rompen el Hidden Markov Model de `/match`: con la traza tal
// cual (9 puntos, con duplicados) `/match` respondía
// `400 {"code":"NoMatch","message":"Could not match the trace."}`; con esos
// mismos 3 puntos únicos, sin tocar nada más, respondía `code: "Ok"`. Subir
// el radio (probado a mano con 50/100/200, no solo con este trazado) **no**
// lo arregla — en cambio empeora: ya en 50m el servidor responde un `TooBig`
// distinto (`"Radius search size is too large for map matching"`, un límite
// propio del radio, no de la cantidad de puntos del fix anterior; no se
// probó el punto exacto entre 25 y 50 donde empieza a fallar, no hace falta
// para descartar la hipótesis). El origen real
// de los duplicados está del lado del tracking GPS de la app móvil (no se
// investigó en esta corrección, queda como deuda técnica — ver
// contexto_proyecto.md); acá se los filtra de forma defensiva porque de
// todos modos son ruido puro para el matching: no aportan ninguna
// información nueva sobre el trayecto.
function quitarPingsDuplicados(pings: PuntoRuta[]): PuntoRuta[] {
  return pings.filter((ping, indice) => {
    if (indice === 0) return true;
    const anterior = pings[indice - 1];
    return !(
      ping.lat === anterior.lat &&
      ping.lng === anterior.lng &&
      ping.timestamp === anterior.timestamp
    );
  });
}

function muestrear<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;

  const paso = (items.length - 1) / (max - 1);
  const muestreados: T[] = [];
  for (let i = 0; i < max; i++) {
    muestreados.push(items[Math.round(i * paso)]);
  }
  return muestreados;
}

/**
 * Parte `items` en tramos consecutivos de hasta `tamanoTramo` puntos, con 1
 * punto de solapamiento entre tramos consecutivos (el último de un tramo es
 * el primero del siguiente). Nunca genera más de `maxTramos` tramos. Si
 * `items` ya entra en un solo tramo, devuelve `[items]` sin partir nada —
 * una jornada corta sigue resolviéndose con una sola llamada a `/match`.
 */
function partirEnTramos<T>(items: T[], tamanoTramo: number, maxTramos: number): T[][] {
  if (items.length <= tamanoTramo) return [items];

  const tramos: T[][] = [];
  let inicio = 0;
  while (inicio < items.length - 1 && tramos.length < maxTramos) {
    const fin = Math.min(inicio + tamanoTramo, items.length);
    tramos.push(items.slice(inicio, fin));
    if (fin >= items.length) break;
    inicio = fin - 1;
  }
  return tramos;
}

interface MatchingOSRM {
  geometry: { coordinates: [number, number][] };
}

interface RespuestaOSRMMatch {
  code: string;
  matchings?: MatchingOSRM[];
}

/**
 * Llama a `/match` para UN tramo de hasta `MAX_PUNTOS_OSRM` puntos y
 * devuelve su geometría ajustada a calles como `[lat, lng]`. Tira un error
 * si OSRM no responde o no puede ajustar ESE tramo — quien llama
 * (`getOSRMRoute`) decide el fallback a línea recta solo para ese tramo, sin
 * afectar a los demás.
 */
async function matchearTramo(tramo: PuntoRuta[]): Promise<[number, number][]> {
  const coordenadasUrl = tramo.map((p) => `${p.lng},${p.lat}`).join(";");
  const timestampsUrl = tramo
    .map((p) => Math.floor(new Date(p.timestamp).getTime() / 1000))
    .join(";");
  const radiusesUrl = tramo.map(() => RADIO_GPS_METROS).join(";");

  const respuesta = await fetch(
    `${OSRM_BASE_URL}/${coordenadasUrl}` +
      `?geometries=geojson&overview=full` +
      `&timestamps=${timestampsUrl}&radiuses=${radiusesUrl}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  );

  if (!respuesta.ok) {
    // El cuerpo de un error de OSRM (ej. `{"code":"TooBig","message":"Too
    // many trace coordinates"}`) es la única forma de distinguir un límite
    // del servidor de un simple 500/502 — sin esto, quien llama solo ve
    // "OSRM respondió 400." en la consola y tiene que ir a las devtools de
    // red a mano para saber por qué. Ver la corrección de MAX_PUNTOS_OSRM
    // más arriba: este es exactamente el error que pasaba desapercibido.
    const cuerpoError = await respuesta.text().catch(() => "");
    throw new Error(`OSRM respondió ${respuesta.status}: ${cuerpoError || "(sin cuerpo)"}`);
  }

  const cuerpo = (await respuesta.json()) as RespuestaOSRMMatch;

  if (cuerpo.code !== "Ok" || !cuerpo.matchings?.length) {
    throw new Error(`OSRM no pudo ajustar la ruta (code: ${cuerpo.code}).`);
  }

  // `/match` puede partir el tramo en varios `matchings` cuando hay un
  // salto de más de 60s entre dos pings consecutivos, o una transición poco
  // plausible entre ellos (cada uno trae su propia geometría). No hace falta
  // unir esos matchings con nada especial: `<Polyline>` ya dibuja una línea
  // recta entre cada par de puntos consecutivos del arreglo `positions`, así
  // que concatenar las geometrías en orden conecta el final de uno con el
  // inicio del siguiente exactamente con el mismo criterio que se usa como
  // fallback cuando OSRM falla del todo (ver getOSRMRoute).
  return cuerpo.matchings.flatMap((matching) =>
    matching.geometry.coordinates.map(([lng, lat]): [number, number] => [lat, lng])
  );
}

export interface ResultadoOSRM {
  trazado: [number, number][];
  /** false si al menos un tramo no pudo ajustarse a calles y se completó con línea recta. */
  matcheoCompleto: boolean;
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
 * Internamente parte el trayecto en tramos (ver `OSRM_MAX_TRAMOS` más
 * arriba) y llama a `/match` una vez por tramo, en secuencia — nunca en
 * paralelo, para no mandarle una ráfaga simultánea de requests al servidor
 * demo público. Un tramo que falla cae a línea recta solo para sus propios
 * puntos, sin afectar a los demás tramos.
 *
 * Tira un error solo si ni siquiera hay 2 pings únicos para intentar algo
 * (después de `quitarPingsDuplicados`) — es responsabilidad de quien llama
 * decidir el fallback total para ese caso (ver useRutaJornada).
 */
export async function getOSRMRoute(pings: PuntoRuta[]): Promise<ResultadoOSRM> {
  const pingsUnicos = quitarPingsDuplicados(pings);
  if (pingsUnicos.length < 2) {
    throw new Error("Se necesitan al menos 2 puntos para calcular una ruta.");
  }

  const pingsMuestreados = muestrear(pingsUnicos, MAX_PUNTOS_TOTAL);
  const tramos = partirEnTramos(pingsMuestreados, MAX_PUNTOS_OSRM, OSRM_MAX_TRAMOS);

  let matcheoCompleto = true;
  const geometriasPorTramo: [number, number][][] = [];
  for (const [indice, tramo] of tramos.entries()) {
    try {
      geometriasPorTramo.push(await matchearTramo(tramo));
    } catch (err) {
      matcheoCompleto = false;
      console.error(
        `OSRM no pudo ajustar el tramo ${indice + 1}/${tramos.length} (${tramo.length} puntos) — se usa línea recta solo para ese tramo:`,
        err
      );
      geometriasPorTramo.push(tramo.map((p): [number, number] => [p.lat, p.lng]));
    }
  }

  return { trazado: geometriasPorTramo.flat(), matcheoCompleto };
}
