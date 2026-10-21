import * as Location from "expo-location";
import {
  decidirUbicacion,
  PermisoUbicacionDenegadoError,
  TIMEOUT_POSICION_NUEVA_MS,
  type DependenciasDecisionUbicacion,
  type PosicionCruda,
} from "./decisionUbicacion";

export { PermisoUbicacionDenegadoError };

export interface Coordenadas {
  lat: number;
  lng: number;
}

function aPosicionCruda(posicion: Location.LocationObject): PosicionCruda {
  return { lat: posicion.coords.latitude, lng: posicion.coords.longitude, timestampMs: posicion.timestamp };
}

// [FIX65] dependencias reales de decidirUbicacion() -- cada una envuelve la llamada a
// expo-location correspondiente.
function construirDependencias(): DependenciasDecisionUbicacion {
  return {
    permisoConcedido: async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === "granted";
    },
    solicitarPermiso: async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === "granted";
    },
    obtenerUltimaConocida: async (maxAgeMs) => {
      const posicion = await Location.getLastKnownPositionAsync({ maxAge: maxAgeMs });
      return posicion ? aPosicionCruda(posicion) : null;
    },
    obtenerNueva: async () => {
      const posicion = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return aPosicionCruda(posicion);
    },
    crearTimeout: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ahora: () => Date.now(),
  };
}

// [FIX65] política decidida (medido: getCurrentPositionAsync tardó 22006ms en el check-out con
// el seguimiento GPS activo, 135ms en el check-in sin seguimiento): no repreguntar el permiso si
// ya está concedido, una caché de hasta 30s sirve tal cual, si no hay una posición nueva tiene
// 10s de margen, y si no llegó a tiempo una caché de hasta 5min sirve igual -- decidirUbicacion()
// es la función pura que decide esto (src/services/decisionUbicacion.ts), acá solo se inyectan
// las dependencias reales y se mapea el resultado al mismo tipo/errores que ya devolvía esta
// función (useUbicacion.ts y sus dos llamadores no cambian).
export async function obtenerUbicacionActual(): Promise<Coordenadas> {
  const resultado = await decidirUbicacion(construirDependencias(), TIMEOUT_POSICION_NUEVA_MS);

  if (!resultado.posicion) {
    // Mismo comportamiento que antes de este fix: si no hay ninguna ubicación disponible (ni
    // caché ni nueva a tiempo), esta función fallaba -- useUbicacion.ts ya atrapa cualquier error
    // que no sea PermisoUbicacionDenegadoError y muestra el mismo mensaje genérico de siempre.
    throw new Error("No se pudo obtener una ubicación.");
  }

  return { lat: resultado.posicion.lat, lng: resultado.posicion.lng };
}
