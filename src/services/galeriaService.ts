import { Alert, Platform } from "react-native";
import * as MediaLibrary from "expo-media-library";
import i18next from "@/i18n";
import { guardarValor, obtenerValor } from "./almacenamientoSeguro";

// Clave fija (spec_copia_fotos_en_galeria.md, Fase 1 punto 6) -- SIN choferId a propósito: es una
// marca del TELÉFONO ("¿ya vio el aviso de la galería alguna vez?"), no del chofer que esté
// logueado en ese momento. cerrarSesion() (AuthContext.tsx) solo borra CLAVE_USUARIO, nunca esta.
const CLAVE_AVISO_VISTO = "app_transp_avisoGaleriaVisto";

// Solo en memoria, a propósito (no SecureStore): "no se vuelve a pedir ni a avisar durante la
// sesión" (criterio 6) es exactamente el alcance de una variable de módulo -- se reinicia en el
// próximo arranque de la app, momento en el que expo-media-library tampoco va a mostrar un
// permiso del sistema de nuevo si el chofer ya lo denegó antes (eso lo decide el propio sistema
// operativo, no esta variable).
let permisoDenegadoEnEstaSesion = false;

async function mostrarAvisoPrimeraVez(): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(
      i18next.t("galeria.avisoTitulo"),
      i18next.t("galeria.avisoMensaje"),
      [{ text: i18next.t("galeria.avisoBoton"), onPress: () => resolve() }],
      { cancelable: false }
    );
  });
}

/**
 * Guarda una copia de `uri` en la galería del teléfono (criterios 1-6, spec_copia_fotos_en_galeria.md,
 * Hallazgo #55) -- único punto de guardado, llamado desde CapturaFoto.tsx y GaleriaFotosIncidencia.tsx
 * justo tras `launchCameraAsync`, con el uri CRUDO (antes de `comprimirImagen()`, criterio 4).
 *
 * Nunca bloquea ni cambia el flujo de captura (criterio 2): el llamador NO espera esta promesa
 * (fire-and-forget) y todo error -- permiso denegado, módulo no disponible en web, `Asset.create`
 * fallando -- queda atrapado acá, se registra una sola vez y nunca se propaga ni se muestra al
 * chofer.
 */
export async function guardarCopiaEnGaleria(uri: string): Promise<void> {
  try {
    // expo-media-library no tiene implementación en web (el bundler "web" de app.json sigue
    // existiendo para desarrollo) -- evita una excepción segura pero ruidosa en cada captura.
    if (Platform.OS === "web") return;
    if (permisoDenegadoEnEstaSesion) return;

    const avisoYaVisto = await obtenerValor(CLAVE_AVISO_VISTO);
    if (!avisoYaVisto) {
      await mostrarAvisoPrimeraVez();
      await guardarValor(CLAVE_AVISO_VISTO, "true");
    }

    // writeOnly=true (criterio 8): solo "añadir a Fotos", nunca permiso de lectura de la galería
    // -- ver Fase 1 punto 4, requestPermissionsAsync(writeOnly, granularPermissions).
    const permiso = await MediaLibrary.requestPermissionsAsync(true);
    if (!permiso.granted) {
      permisoDenegadoEnEstaSesion = true;
      return;
    }

    // API de clases (criterio 8) -- saveToLibraryAsync ya no funciona en esta versión (Fase 1
    // punto 4: lanza en runtime). Sin álbum: queda suelta en el rollo (§2 punto 2 de la spec).
    await MediaLibrary.Asset.create(uri);
  } catch (err) {
    console.error("guardarCopiaEnGaleria falló:", err);
  }
}
