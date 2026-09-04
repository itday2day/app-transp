import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// expo-secure-store no tiene Keychain/Keystore en web (su build web no implementa
// los métodos nativos), así que ahí se usa localStorage como respaldo; en
// iOS/Android sigue guardándose cifrado en SecureStore.
export async function guardarValor(clave: string, valor: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(clave, valor);
    return;
  }
  await SecureStore.setItemAsync(clave, valor);
}

export async function obtenerValor(clave: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(clave);
  }
  return SecureStore.getItemAsync(clave);
}

export async function borrarValor(clave: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(clave);
    return;
  }
  await SecureStore.deleteItemAsync(clave);
}
