import { useEffect, useRef, useState } from "react";

// Hallazgo #46 (spec_jornada_obsoleta_y_fotos_locales.md): una foto puede tener un URI local
// (archivo del dispositivo) y/o una URL remota (ya subida). Extraído de DetalleJornadaScreen para
// que el visor de pantalla completa (spec_mejoras_carga_jornada_fotos_enlaces.md) siga exactamente
// la misma cadena de respaldo que la miniatura, en vez de abrirse sobre lo que la miniatura ya
// probó que no carga.
const TIEMPO_ESPERA_FOTO_MS = 8000;

/** Devuelve la fuente que hay que intentar mostrar ahora mismo (local primero, remota como
 * respaldo), y avanza sola a la siguiente si la actual tarda demasiado o falla. */
export function useFuenteFoto(uri?: string, url?: string) {
  const fuentes = [uri, url].filter((valor): valor is string => Boolean(valor));
  const [indice, setIndice] = useState(0);
  const cargadaRef = useRef(false);
  const fuenteActual = fuentes[indice];

  useEffect(() => {
    cargadaRef.current = false;
    if (!fuenteActual) return;
    const temporizador = setTimeout(() => {
      if (!cargadaRef.current) setIndice((i) => i + 1);
    }, TIEMPO_ESPERA_FOTO_MS);
    return () => clearTimeout(temporizador);
  }, [fuenteActual]);

  function alCargar() {
    cargadaRef.current = true;
  }

  function alFallar() {
    setIndice((i) => i + 1);
  }

  return { fuenteActual, alCargar, alFallar };
}
