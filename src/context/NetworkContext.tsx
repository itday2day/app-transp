import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as Network from "expo-network";
import { AppState } from "react-native";
import { hayJornadasPendientes, sincronizarPendientes } from "@/services/syncService";

interface NetworkContextValor {
  conectado: boolean;
  sincronizando: boolean;
  ultimaSincronizacion: Date | null;
  sincronizarAhora: (forzarReintento?: boolean) => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValor | undefined>(undefined);

const INTERVALO_REVISION_MS = 15000;

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [conectado, setConectado] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSincronizacion, setUltimaSincronizacion] = useState<Date | null>(null);
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

  useEffect(() => {
    let activo = true;

    async function revisar() {
      const estado = await Network.getNetworkStateAsync();
      const haySenal = Boolean(estado.isConnected && estado.isInternetReachable);
      if (!activo) return;
      setConectado(haySenal);
      if (haySenal) sincronizarAhora();
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
  }, [sincronizarAhora]);

  return (
    <NetworkContext.Provider value={{ conectado, sincronizando, ultimaSincronizacion, sincronizarAhora }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValor {
  const contexto = useContext(NetworkContext);
  if (!contexto) throw new Error("useNetwork debe usarse dentro de un NetworkProvider");
  return contexto;
}
