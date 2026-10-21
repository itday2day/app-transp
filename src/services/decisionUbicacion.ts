// Lógica PURA de "qué ubicación usar" para check-in/check-out (Hallazgo #65). Medido en el
// Samsung (dev client): con el seguimiento GPS activo (useSeguimientoGPS.ts, timeInterval 20s),
// getCurrentPositionAsync tardó 22006 ms en el check-out; sin seguimiento, en el check-in, 135 ms.
// Política decidida por el usuario ("ubicación de hasta 30s"): 1) no pedir el permiso si ya está
// concedido, 2) una posición reciente (<=30s) de caché sirve tal cual, 3) si no hay caché, probar
// una posición nueva con un margen de 10s, 4) si no llegó a tiempo, una caché más vieja (<=5min)
// sirve igual, 5) si no hay nada de nada, el mismo comportamiento que ya tenía la pantalla.
//
// Sin ningún import de expo-location/React -- todo lo que puede tardar o fallar (permiso, caché,
// posición nueva, el reloj/timeout) se recibe inyectado, así se prueba con una tabla literal en
// Node (ver specs/pruebas_auth/prueba_decisionUbicacion.js) sin simular React Native.

export class PermisoUbicacionDenegadoError extends Error {}

export interface PosicionCruda {
  lat: number;
  lng: number;
  timestampMs: number;
}

export type FuenteUbicacion = "cache30s" | "nueva" | "cache5min" | "ninguna";

export interface ResultadoDecisionUbicacion {
  fuente: FuenteUbicacion;
  posicion: PosicionCruda | null;
  edadMs: number;
}

export interface DependenciasDecisionUbicacion {
  permisoConcedido: () => Promise<boolean>;
  solicitarPermiso: () => Promise<boolean>;
  obtenerUltimaConocida: (maxAgeMs: number) => Promise<PosicionCruda | null>;
  obtenerNueva: () => Promise<PosicionCruda>;
  crearTimeout: (ms: number) => Promise<void>;
  ahora: () => number;
}

export const MAX_AGE_CACHE_CORTA_MS = 30000;
export const MAX_AGE_CACHE_LARGA_MS = 300000;
export const TIMEOUT_POSICION_NUEVA_MS = 10000;

export const MENSAJE_PERMISO_DENEGADO =
  "Necesitamos acceso a tu ubicación para registrar el inicio/cierre de la jornada. Actívalo en Ajustes.";

type ResultadoCarrera = { tipo: "nueva"; posicion: PosicionCruda } | { tipo: "timeout" };

export async function decidirUbicacion(
  deps: DependenciasDecisionUbicacion,
  timeoutMs: number = TIMEOUT_POSICION_NUEVA_MS
): Promise<ResultadoDecisionUbicacion> {
  let concedido = await deps.permisoConcedido();
  if (!concedido) {
    concedido = await deps.solicitarPermiso();
    if (!concedido) {
      throw new PermisoUbicacionDenegadoError(MENSAJE_PERMISO_DENEGADO);
    }
  }

  const cacheCorta = await deps.obtenerUltimaConocida(MAX_AGE_CACHE_CORTA_MS);
  if (cacheCorta) {
    return {
      fuente: "cache30s",
      posicion: cacheCorta,
      edadMs: Math.max(0, deps.ahora() - cacheCorta.timestampMs),
    };
  }

  // `.then(onFulfilled, onRejected)` se cuelga YA, antes de cualquier await -- si esta promesa
  // termina rechazada (falló el GPS), ya quedó atendida sin importar si gana o pierde la carrera
  // contra el timeout, nunca queda como un rechazo "unhandled".
  const promesaNueva = deps.obtenerNueva();
  const carrera = await Promise.race<ResultadoCarrera>([
    promesaNueva.then(
      (posicion): ResultadoCarrera => ({ tipo: "nueva", posicion }),
      (): ResultadoCarrera => ({ tipo: "timeout" })
    ),
    deps.crearTimeout(timeoutMs).then((): ResultadoCarrera => ({ tipo: "timeout" })),
  ]);

  if (carrera.tipo === "nueva") {
    return { fuente: "nueva", posicion: carrera.posicion, edadMs: 0 };
  }

  const cacheLarga = await deps.obtenerUltimaConocida(MAX_AGE_CACHE_LARGA_MS);
  if (cacheLarga) {
    return {
      fuente: "cache5min",
      posicion: cacheLarga,
      edadMs: Math.max(0, deps.ahora() - cacheLarga.timestampMs),
    };
  }

  return { fuente: "ninguna", posicion: null, edadMs: 0 };
}
