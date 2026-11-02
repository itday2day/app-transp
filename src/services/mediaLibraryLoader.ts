import type * as MediaLibraryType from "expo-media-library";
import { isRunningInExpoGo } from "expo";

// spec_import_diferido_expo_media_library.md, corrección tras la prueba en el Samsung
// (2026-11-02): un `require("expo-media-library")` que falla NO es atrapable con un try/catch --
// Metro enruta esa excepción a `ErrorUtils.reportFatalError()` en vez de dejarla subir hasta acá
// (confirmado en metro-runtime/src/polyfills/require.js:177-192, `guardedLoadModule`), y en un
// build de release eso cierra la app (ExceptionsManager.js:111-134). La única defensa real es NO
// llamar a `require()` en Expo Go, que es el único entorno donde el módulo falta hoy.
//
// Se detecta con `isRunningInExpoGo()` del paquete `expo` -- NO con `Constants.executionEnvironment`
// (su valor "storeClient" es el mismo en Expo Go y en un build de desarrollo con expo-dev-client,
// que SÍ lleva el módulo compilado). `isRunningInExpoGo()` comprueba la presencia del módulo
// nativo 'ExpoGo' (expo/src/environment/ExpoGo.ts) -- ese módulo solo existe DENTRO del binario de
// Expo Go; ni un build de expo-dev-client ni un .apk de EAS lo tienen, son binarios distintos. Esa
// función statup-time usa su PROPIO try/catch alrededor de una llamada normal (requireNativeModule,
// que lanza una excepción de JS común, no un require() de Metro) -- por eso sí protege, a
// diferencia de nuestro caso con expo-media-library.
//
// Separado de galeriaService.ts (que importa react-native) para poder compilarse y probarse en
// Node puro, sin ningún entorno nativo -- mismo motivo que jornadasMapeo.ts.
let moduloCache: typeof MediaLibraryType | null | undefined;

/** Carga expo-media-library la primera vez que se llama y cachea el resultado -- nunca vuelve a
 * intentar la carga ni a emitir la advertencia más de una vez. En Expo Go (detectado con
 * `estaEnExpoGo`, por defecto `isRunningInExpoGo` del paquete `expo`) devuelve `null` SIN llamar a
 * `require()`, porque el módulo no está compilado ahí. En cualquier otro entorno (`.apk` de EAS,
 * build de desarrollo con expo-dev-client, bare) hace el `require()` igual que antes del commit
 * 451c21e -- nunca se omite fuera de Expo Go. `estaEnExpoGo` es un parámetro sustituible solo para
 * poder probar esta función en Node sin depender de `expo` en runtime. */
export function cargarMediaLibrary(
  estaEnExpoGo: () => boolean = isRunningInExpoGo
): typeof MediaLibraryType | null {
  if (moduloCache !== undefined) return moduloCache;

  if (estaEnExpoGo()) {
    console.warn("expo-media-library no está incluido en Expo Go -- se omite la copia a galería.");
    moduloCache = null;
    return moduloCache;
  }

  // Fuera de Expo Go el módulo SÍ debería estar compilado (build de desarrollo, .apk de EAS, bare)
  // -- este try/catch queda como red general, no como protección real contra un módulo nativo
  // ausente: si de verdad faltara acá, Metro cerraría la app igual (ver comentario de arriba), este
  // catch nunca llegaría a ejecutarse.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- carga diferida a propósito.
    moduloCache = require("expo-media-library") as typeof MediaLibraryType;
  } catch (err) {
    console.warn("expo-media-library no disponible, se omite la copia a galería:", err);
    moduloCache = null;
  }
  return moduloCache;
}
