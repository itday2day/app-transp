import * as ImageManipulator from "expo-image-manipulator";

const ANCHO_MAXIMO = 1280;
const CALIDAD_COMPRESION = 0.6;

/**
 * Redimensiona y comprime una foto antes de guardarla/subirla, para no
 * gastar el plan de datos móvil del chofer en zonas con señal débil.
 */
export async function comprimirImagen(uriOriginal: string): Promise<string> {
  const resultado = await ImageManipulator.manipulateAsync(
    uriOriginal,
    [{ resize: { width: ANCHO_MAXIMO } }],
    { compress: CALIDAD_COMPRESION, format: ImageManipulator.SaveFormat.JPEG }
  );
  return resultado.uri;
}
