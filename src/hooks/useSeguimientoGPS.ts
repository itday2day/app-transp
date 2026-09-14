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

  // ⚠️ **Diagnóstico (2026-09-14)**: pings con lat/lng/timestamp exactamente
  // idénticos, repetidos hasta 5 veces, aparecían en `ubicaciones_tracking`
  // para jornadas reales del piloto — se filtraban del lado del Dashboard
  // (`quitarPingsDuplicados`), pero el origen no estaba confirmado.
  //
  // Se descartó con evidencia la sospecha inicial ("el efecto no cancela
  // bien la suscripción anterior si se remonta rápido"): el patrón acá —
  // `cancelado` como flag capturado por closure + `suscripcionRef` como
  // `useRef` (no una variable local) en la función de limpieza — es
  // justamente el patrón robusto contra esa race: la limpieza siempre lee
  // `suscripcionRef.current` en el momento en que corre, nunca un valor
  // obsoleto, así que una suscripción vieja jamás queda huérfana por esto.
  // Tampoco es un problema de dependencias inestables: `usuario` (de
  // AuthContext) solo cambia de referencia en login/logout, y
  // `claveJornadas` viene de una consulta SQLite con `ORDER BY fechaCheckIn
  // DESC` estable — no hay razón para que el efecto se reinicie espontáneamente
  // por un re-render.
  //
  // Revisando pings reales de varias jornadas (vía `service_role`, varios
  // choferes, varios días): los duplicados aparecen en jornadas con una
  // sola jornada activa (descarta que sea por solapamiento de jornadas
  // concurrentes cambiando `claveJornadas`), en ráfagas de tamaño variable
  // (x1 a x5) que tienden a agruparse después de una brecha de varios
  // minutos sin pings, o justo antes del check-out — el patrón típico de
  // cuando la app vuelve a primer plano tras estar en segundo plano un
  // rato. Es consistente con que el proveedor de ubicación del SO
  // reentregue una posición cacheada/reciente al reanudar la entrega de
  // actualizaciones, más que con un bug de este efecto — pero no se pudo
  // confirmar el mecanismo nativo exacto sin logs de dispositivo en vivo
  // (fuera del alcance de esta corrección).
  //
  // Ante esa incertidumbre, se aplica la opción de la especificación para
  // ese caso: filtrar en origen antes de escribir, comparando contra el
  // último ping efectivamente enviado — mismo criterio exacto que
  // `quitarPingsDuplicados` del lado del Dashboard (lat+lng+timestamp
  // idénticos), pero evitando la escritura redundante en vez de solo
  // descartarla al leer. No hace falta reiniciarlo entre efectos: se quiere
  // comparar contra el último ping real enviado por este hook, sin
  // importar si vino de esta corrida del efecto o de una anterior.
  const ultimoPingEnviadoRef = useRef<{ lat: number; lng: number; timestamp: string } | null>(null);

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

          const lat = posicion.coords.latitude;
          const lng = posicion.coords.longitude;
          const timestamp = new Date(posicion.timestamp).toISOString();

          const ultimo = ultimoPingEnviadoRef.current;
          if (ultimo && ultimo.lat === lat && ultimo.lng === lng && ultimo.timestamp === timestamp) {
            console.warn("Ping de GPS idéntico al anterior, descartado en origen:", {
              lat,
              lng,
              timestamp,
            });
            return;
          }
          ultimoPingEnviadoRef.current = { lat, lng, timestamp };

          enviarPing({
            choferId: usuario.id,
            jornadaIds,
            lat,
            lng,
            velocidadKmh: posicion.coords.speed != null ? Math.max(0, posicion.coords.speed * 3.6) : null,
            timestamp,
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
