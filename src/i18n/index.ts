import i18next, { type ParseKeys } from "i18next";
import { initReactI18next } from "react-i18next";
import es from "./locales/es.json";
import en from "./locales/en.json";

export const IDIOMAS_DISPONIBLES = ["es", "en"] as const;
export type Idioma = (typeof IDIOMAS_DISPONIBLES)[number];

// Unión de todas las claves de traducción válidas (dotted-path), derivada del
// diccionario. Se usa para tipar tablas de búsqueda dinámicas (Record<X, ClaveTraduccion>)
// cuya clave se resuelve en tiempo de ejecución antes de llamar a t().
export type ClaveTraduccion = ParseKeys;

// eslint-disable-next-line import/no-named-as-default-member -- i18next.use() es la API real documentada, no un named export mal referenciado.
i18next.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: "es",
  fallbackLng: "es",
  interpolation: {
    escapeValue: false,
  },
});

export default i18next;
