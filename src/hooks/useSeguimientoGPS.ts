import { useEffect, useRef } from "react";
import * as Location from "expo-location";
import { useAuth } from "@/context/AuthContext";
import { enviarPing } from "@/services/trackingService";

const INTERVALO_MS = 20000;
const DISTANCIA_METROS = 50;

// Tracking en PRIMER PLANO únicamente (mientras la app está abierta). El
// tracking en segundo plano (app minimizada/cerrada) requiere expo-task-manager
// + permisos de ubicación en segundo plano — módulos nativos no compilados en
// el APK de desarrollo actual, así que se queda fuera a propósito (mismo
// criterio que con AsyncStorage/expo-localization en tareas anteriores).
export function useSeguimientoGPS(jornadaIds: string[]): void {
  const { usuario } = useAuth();
  const suscripcionRef = useRef<Location.LocationSubscription | null>(null);
  const claveJornadas = jornadaIds.join(",");

  useEffect(() => {
    let cancelado = false;

    async function iniciar() {
      if (!usuario || jornadaIds.length === 0) return;

      const permiso = await Location.getForegroundPermissionsAsync();
      if (permiso.status !== "granted") return;

      const suscripcion = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: INTERVALO_MS,
          distanceInterval: DISTANCIA_METROS,
        },
        (posicion) => {
          if (cancelado || !usuario) return;
          enviarPing({
            choferId: usuario.id,
            jornadaIds,
            lat: posicion.coords.latitude,
            lng: posicion.coords.longitude,
            velocidadKmh: posicion.coords.speed != null ? Math.max(0, posicion.coords.speed * 3.6) : null,
            timestamp: new Date(posicion.timestamp).toISOString(),
          });
        }
      );

      if (cancelado) {
        suscripcion.remove();
        return;
      }
      suscripcionRef.current = suscripcion;
    }

    iniciar();

    return () => {
      cancelado = true;
      suscripcionRef.current?.remove();
      suscripcionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, claveJornadas]);
}
