import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { AppState } from "react-native";
import { guardarValor, obtenerValor, borrarValor } from "@/services/almacenamientoSeguro";

const SUPABASE_URL: string =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? (Constants.expoConfig?.extra?.supabaseUrl as string);
const SUPABASE_ANON_KEY: string =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? (Constants.expoConfig?.extra?.supabaseAnonKey as string);

// expo-secure-store ya es la única fuente de persistencia segura del proyecto
// (ver almacenamientoSeguro.ts) — se envuelve con la forma {getItem,setItem,
// removeItem} que espera supabase-js en vez de sumar @react-native-async-storage,
// que exigiría reconstruir el dev client nativo.
const almacenamientoSesion = {
  getItem: (clave: string) => obtenerValor(clave),
  setItem: (clave: string, valor: string) => guardarValor(clave, valor),
  removeItem: (clave: string) => borrarValor(clave),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: almacenamientoSesion,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// El timer de autoRefreshToken de supabase-js sigue disparando aunque la app
// esté en segundo plano si nadie lo para — en iOS eso intenta leer el
// Keychain (vía SecureStore, ver almacenamientoSeguro.ts) con la app
// backgrounded, y falla con "KeyChainException: User interaction is not
// allowed" (SecureStore no puede pedir presencia del usuario/desbloqueo
// mientras la app no está activa). Patrón oficial de Supabase para React
// Native: https://supabase.com/docs/reference/javascript/auth-startautorefresh
AppState.addEventListener("change", (estado) => {
  if (estado === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
