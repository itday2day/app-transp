import { useCallback, useState } from "react";
import {
  Coordenadas,
  obtenerUbicacionActual,
  PermisoUbicacionDenegadoError,
} from "@/services/locationService";

interface UseUbicacionResultado {
  coordenadas: Coordenadas | null;
  obteniendo: boolean;
  error: string | null;
  capturarUbicacion: () => Promise<Coordenadas | null>;
}

export function useUbicacion(): UseUbicacionResultado {
  const [coordenadas, setCoordenadas] = useState<Coordenadas | null>(null);
  const [obteniendo, setObteniendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capturarUbicacion = useCallback(async () => {
    setObteniendo(true);
    setError(null);
    try {
      const punto = await obtenerUbicacionActual();
      setCoordenadas(punto);
      return punto;
    } catch (err) {
      console.error("capturarUbicacion falló:", err);
      const mensaje =
        err instanceof PermisoUbicacionDenegadoError
          ? err.message
          : "No pudimos obtener tu ubicación. Verifica que el GPS esté activado.";
      setError(mensaje);
      return null;
    } finally {
      setObteniendo(false);
    }
  }, []);

  return { coordenadas, obteniendo, error, capturarUbicacion };
}
