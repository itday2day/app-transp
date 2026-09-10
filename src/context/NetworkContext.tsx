import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as Network from "expo-network";
import { AppState } from "react-native";
import { sincronizarPendientes } from "@/services/syncService";

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
    setSincronizando(true);
    try {
      const estado = await Network.getNetworkStateAsync();
      if (!estado.isConnected || !estado.isInternetReachable) return;
      await sincronizarPendientes(forzarReintento);
      setUltimaSincronizacion(new Date());
    } finally {
      sincronizandoRef.current = false;
      setSincronizando(false);
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
