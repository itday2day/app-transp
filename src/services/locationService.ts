import * as Location from "expo-location";

export interface Coordenadas {
  lat: number;
  lng: number;
}

export class PermisoUbicacionDenegadoError extends Error {}

export async function obtenerUbicacionActual(): Promise<Coordenadas> {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    throw new PermisoUbicacionDenegadoError(
      "Necesitamos acceso a tu ubicación para registrar el inicio/cierre de la jornada. Actívalo en Ajustes."
    );
  }

  const posicion = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return { lat: posicion.coords.latitude, lng: posicion.coords.longitude };
}
