import { Linking, Platform } from "react-native";

// Sin Linking.canOpenURL() previo: verificar los esquemas geo:/maps: de
// antemano exige declarar <queries> en el manifiesto nativo de Android,
// configuración que no podemos tocar sin reconstruir el dev client (mismo
// criterio que el resto del proyecto). Se intenta abrir directo.
export async function abrirMapa(lat: number, lng: number): Promise<void> {
  const urlWeb = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const url = Platform.select({
    ios: `maps:0,0?q=${lat},${lng}`,
    android: `geo:0,0?q=${lat},${lng}`,
    default: urlWeb,
  });

  try {
    await Linking.openURL(url ?? urlWeb);
  } catch {
    // Sin fallback ulterior: si ni el esquema nativo ni el enlace web abren,
    // no hay nada más razonable que intentar.
  }
}
