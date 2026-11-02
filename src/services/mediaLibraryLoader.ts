import type * as MediaLibraryType from "expo-media-library";

// spec_import_diferido_expo_media_library.md: un `import` estático de expo-media-library en
// galeriaService.ts ejecuta la resolución del módulo nativo al arrancar la app -- metro.config.js
// no activa inlineRequires (confirmado leyendo node_modules/@expo/metro-config, que lo pone en
// `false` por defecto), así que un `require()` dentro de esta función es el patrón que de verdad
// difiere la carga en este Metro/Hermes, a diferencia de `await import()` (innecesario acá: no hay
// nada async real que esperar, solo evitar la resolución al importar).
//
// Separado de galeriaService.ts (que importa react-native) para poder compilarse y probarse en
// Node puro, sin ningún entorno nativo -- mismo motivo que jornadasMapeo.ts.
let moduloCache: typeof MediaLibraryType | null | undefined;

/** Carga expo-media-library la primera vez que se llama y cachea el resultado (éxito o fallo) --
 * nunca vuelve a intentar la carga ni a emitir la advertencia más de una vez. Si el módulo no está
 * disponible (ej. el binario de Expo Go no lo trae todavía), devuelve `null` y deja una sola
 * advertencia en el registro; nunca lanza hacia arriba. */
export function cargarMediaLibrary(): typeof MediaLibraryType | null {
  if (moduloCache !== undefined) return moduloCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- carga diferida a propósito.
    moduloCache = require("expo-media-library") as typeof MediaLibraryType;
  } catch (err) {
    console.warn("expo-media-library no disponible, se omite la copia a galería:", err);
    moduloCache = null;
  }
  return moduloCache;
}
