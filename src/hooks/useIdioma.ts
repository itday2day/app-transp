import { useCallback, useEffect, useState } from "react";
import i18next, { Idioma } from "@/i18n";
import { guardarValor, obtenerValor } from "@/services/almacenamientoSeguro";

const CLAVE_IDIOMA = "idioma_preferido";

function normalizarIdioma(valor: string | null): Idioma {
  return valor === "en" ? "en" : "es";
}

// Se usa en el arranque de App.tsx (antes del primer render) para que la app
// abra directamente en el idioma guardado, sin parpadeo de español->inglés.
export async function cargarIdiomaGuardado(): Promise<Idioma> {
  const guardado = await obtenerValor(CLAVE_IDIOMA);
  const idioma = normalizarIdioma(guardado);
  await i18next.changeLanguage(idioma);
  return idioma;
}

export function useIdioma() {
  const [idioma, setIdioma] = useState<Idioma>(normalizarIdioma(i18next.language));

  useEffect(() => {
    cargarIdiomaGuardado().then(setIdioma);
  }, []);

  const cambiarIdioma = useCallback(async (nuevoIdioma: Idioma) => {
    setIdioma(nuevoIdioma);
    await i18next.changeLanguage(nuevoIdioma);
    await guardarValor(CLAVE_IDIOMA, nuevoIdioma);
  }, []);

  return { idioma, cambiarIdioma };
}
