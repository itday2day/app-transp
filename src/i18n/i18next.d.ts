import "i18next";
import es from "./locales/es.json";

// Augmentación oficial de i18next: usa la forma de es.json como fuente de
// verdad para que t("clave.anidada") tenga autocompletado y error de
// compilación si la clave no existe en el diccionario.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof es;
    };
  }
}
