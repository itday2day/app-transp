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

const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";

// El límite real es el largo de la URL (las coordenadas van en el path, no
// en el body) — cada par "lng,lat;" ronda 20-24 caracteres con 5 decimales
// de precisión (~1m de resolución, de sobra para pings de GPS). 100 puntos
// da una URL de ~2200 caracteres, dentro de límites típicos de servidor/
// navegador con margen. Si hay más, se muestrea parejo conservando siempre
// el primer y el último punto (para no perder inicio/fin del trayecto).
const MAX_PUNTOS_OSRM = 100;

function muestrear(coordenadas: [number, number][], max: number): [number, number][] {
  if (coordenadas.length <= max) return coordenadas;

  const paso = (coordenadas.length - 1) / (max - 1);
  const muestreadas: [number, number][] = [];
  for (let i = 0; i < max; i++) {
    muestreadas.push(coordenadas[Math.round(i * paso)]);
  }
  return muestreadas;
}

interface RespuestaOSRM {
  code: string;
  routes?: { geometry: { coordinates: [number, number][] } }[];
}

/**
 * Recibe pings de GPS como `[lat, lng]` (el orden que usa el resto de este
 * proyecto — Leaflet, PosicionChofer, etc.) y devuelve el trazado ajustado a
 * las calles, también como `[lat, lng]`, listo para `<Polyline positions=.../>`.
 * La conversión a `lng,lat` (lo que exige la URL de OSRM) y de vuelta a
 * `lat,lng` (lo que devuelve el GeoJSON de la respuesta) queda encapsulada
 * acá — quien llama nunca maneja el orden invertido.
 *
 * Tira un error si OSRM no responde o no encuentra ruta — es responsabilidad
 * de quien llama decidir el fallback (ver useRutaJornada).
 */
export async function getOSRMRoute(puntosLatLng: [number, number][]): Promise<[number, number][]> {
  if (puntosLatLng.length < 2) {
    throw new Error("Se necesitan al menos 2 puntos para calcular una ruta.");
  }

  const muestreados = muestrear(puntosLatLng, MAX_PUNTOS_OSRM);
  const coordenadasUrl = muestreados.map(([lat, lng]) => `${lng},${lat}`).join(";");

  const respuesta = await fetch(
    `${OSRM_BASE_URL}/${coordenadasUrl}?overview=full&geometries=geojson`
  );

  if (!respuesta.ok) {
    throw new Error(`OSRM respondió ${respuesta.status}.`);
  }

  const cuerpo = (await respuesta.json()) as RespuestaOSRM;

  if (cuerpo.code !== "Ok" || !cuerpo.routes?.[0]) {
    throw new Error(`OSRM no pudo calcular la ruta (code: ${cuerpo.code}).`);
  }

  // GeoJSON siempre es [lng, lat] — acá se invierte a [lat, lng] para Leaflet.
  return cuerpo.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}
