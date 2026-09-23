import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as Network from "expo-network";
import { AppState } from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  hayJornadasPendientes,
  sincronizarPendientes,
  reconciliarJornadasAbiertas,
  recuperarJornadasAbiertas,
} from "@/services/syncService";
import { Jornada } from "@/types";

interface NetworkContextValor {
  conectado: boolean;
  sincronizando: boolean;
  ultimaSincronizacion: Date | null;
  sincronizarAhora: (forzarReintento?: boolean) => Promise<void>;
  /** Momento de la última corrida de reconciliación que efectivamente cerró
   * alguna jornada (ver reconciliarJornadasAbiertas) — `null` hasta que pase
   * la primera vez. `useJornadasAbiertas()` lo escucha para refrescar su
   * lista aunque `CheckInScreen` no tenga el foco en ese momento (bottom-tabs
   * no la desmonta al cambiar de pestaña, así que sigue reaccionando igual). */
  jornadasReconciliadasEn: Date | null;
  /** Última tanda de jornadas recuperadas desde Supabase (ver
   * recuperarJornadasAbiertas, spec_deudas_app_movil.md) — jornadas abiertas que existían en el
   * servidor pero no en este teléfono (desinstalación, Android limpiando almacenamiento). `[]`
   * hasta que pase la primera vez o si nunca hay nada que recuperar (el caso común).
   * `useJornadasAbiertas()` lo usa para avisar en pantalla, no solo para refrescar la lista —
   * "se recuperó" es información que el chofer tiene que ver, no un refresco silencioso. */
  jornadasRecuperadas: Jornada[];
}

const NetworkContext = createContext<NetworkContextValor | undefined>(undefined);

const INTERVALO_REVISION_MS = 15000;

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  const [conectado, setConectado] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSincronizacion, setUltimaSincronizacion] = useState<Date | null>(null);
  const [jornadasReconciliadasEn, setJornadasReconciliadasEn] = useState<Date | null>(null);
  const [jornadasRecuperadas, setJornadasRecuperadas] = useState<Jornada[]>([]);
  const sincronizandoRef = useRef(false);

  const sincronizarAhora = useCallback(async (forzarReintento = false) => {
    if (sincronizandoRef.current) return;
    sincronizandoRef.current = true;
    try {
      const estado = await Network.getNetworkStateAsync();
      if (!estado.isConnected || !estado.isInternetReachable) return;

      // El chequeo corre cada 15s (ver INTERVALO_REVISION_MS) y la enorme
      // mayoría de las veces no hay nada pendiente — sin este chequeo previo,
      // el banner "Sincronizando…" de BannerConexion prendía y apagaba en
      // cada corrida, así la app estuviera al día, dando un parpadeo visible
      // cada 15s. Ahora solo se enciende cuando de verdad hay algo que subir.
      if (!(await hayJornadasPendientes(forzarReintento))) return;

      setSincronizando(true);
      try {
        await sincronizarPendientes(forzarReintento);
        setUltimaSincronizacion(new Date());
      } finally {
        setSincronizando(false);
      }
    } finally {
      sincronizandoRef.current = false;
    }
  }, []);

  // Reconciliación: baja el estado real de Supabase para jornadas que la app
  // ya dio por sincronizadas — necesario porque un administrador puede
  // cerrar una jornada directo desde el Dashboard ("Corregir", Hallazgo #6)
  // sin pasar nunca por la app, y `sincronizarAhora` de arriba es de subida
  // exclusivamente. Ver el detalle completo en
  // syncService.reconciliarJornadasAbiertas. Función separada de
  // `sincronizarAhora` (no un paso más adentro de ella): son dos
  // preocupaciones distintas — "subir lo que tengo pendiente" vs. "bajar lo
  // que cambió sin mí" — que solo comparten el mismo ciclo de revisión.
  const reconciliarSiCorresponde = useCallback(async () => {
    if (!usuario) return;
    try {
      const cerradas = await reconciliarJornadasAbiertas(usuario.id);
      if (cerradas.length > 0) setJornadasReconciliadasEn(new Date());
    } catch (err) {
      console.error("reconciliarSiCorresponde falló:", err);
    }
  }, [usuario]);

  // Recuperación: trae de Supabase las jornadas abiertas de este chofer que el teléfono no
  // tiene (spec_deudas_app_movil.md, Hallazgo #5) — a diferencia de reconciliarSiCorresponde
  // (que recorre lo que YA hay en local), esto consulta por chofer, así que encuentra lo que el
  // teléfono nunca llegó a conocer. Mismo ciclo de revisión que las otras dos: si no hay señal
  // cuando el chofer recién entra, se reintenta solo en la próxima corrida (cada 15s o al volver
  // a foreground) sin que nadie tenga que pedirlo de nuevo a mano.
  const recuperarSiCorresponde = useCallback(async () => {
    if (!usuario) return;
    try {
      const recuperadas = await recuperarJornadasAbiertas(usuario.id);
      if (recuperadas.length > 0) setJornadasRecuperadas(recuperadas);
    } catch (err) {
      console.error("recuperarSiCorresponde falló:", err);
    }
  }, [usuario]);

  useEffect(() => {
    let activo = true;

    async function revisar() {
      const estado = await Network.getNetworkStateAsync();
      const haySenal = Boolean(estado.isConnected && estado.isInternetReachable);
      if (!activo) return;
      setConectado(haySenal);
      if (haySenal) {
        sincronizarAhora();
        reconciliarSiCorresponde();
        recuperarSiCorresponde();
      }
    }

    revisar();
    const intervalo = setInterval(revisar, INTERVALO_REVISION_MS);
    const suscripcion = AppState.addEventListener("change", (estado) => {
      if (estado === "active") revisar();
    });

    return () => {
      activo = false;
      clearInterval(intervalo);
      suscripcion.remove();
    };
  }, [sincronizarAhora, reconciliarSiCorresponde, recuperarSiCorresponde]);

  return (
    <NetworkContext.Provider
      value={{
        conectado,
        sincronizando,
        ultimaSincronizacion,
        sincronizarAhora,
        jornadasReconciliadasEn,
        jornadasRecuperadas,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValor {
  const contexto = useContext(NetworkContext);
  if (!contexto) throw new Error("useNetwork debe usarse dentro de un NetworkProvider");
  return contexto;
}
