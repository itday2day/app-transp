import { CompositeNavigationProp, NavigatorScreenParams, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

export type RootStackParamList = {
  Login: undefined;
  // spec_cambio_contrasena_login.md: única ruta de cambio voluntario de contraseña, alcanzable
  // sin sesión desde Login — reemplaza al enlace "Crear cuenta nueva" (RegistroScreen.tsx,
  // eliminada) y al botón "Contraseña" que antes vivía en el header de PrincipalTabs (dos caminos
  // para la misma acción era el patrón del Hallazgo #21).
  CambiarContrasena: undefined;
  CambiarContrasenaObligatorio: undefined;
  // spec_app_registro_paso5.md, paso 2c-1: `correo` es el ÚNICO dato no sensible que necesita esta
  // pantalla (se muestra en pantalla: "te enviamos un código a {{correo}}") -- NUNCA una
  // contraseña ni un código acá (criterio 10, nada sensible en route.params persistentes).
  // `tipo` decide qué llama verificarCodigo()/reenviarCodigo() ("recovery" lo completa 2c-2, esta
  // ronda solo implementa "signup"). `origen` es solo para matizar el arranque de la cuenta
  // regresiva (ver CodigoVerificacionScreen.tsx) y, en 2c-2, para el botón "Olvidé mi contraseña"
  // que solo aplica si origen:"login" -- no cambia ninguna llamada a authCore.ts.
  CodigoVerificacion: {
    correo: string;
    tipo: "signup" | "recovery";
    origen: "registro" | "login" | "recuperacion";
  };
  // spec_app_registro_paso5.md, paso 2c-2: pide el correo (resetPasswordForEmail/pedirRecuperacion)
  // y navega a CodigoVerificacion({correo, tipo:"recovery", origen:"login"}) -- sin params.
  RecuperarContrasena: undefined;
  // paso 2c-2: `correo` es solo para mostrarlo en pantalla ("nueva contraseña para {{correo}}") --
  // terminarRecuperacion() opera sobre la sesión YA activa (verifyOtp(recovery) la deja abierta),
  // no necesita el correo para nada funcional. R1: esta pantalla SÍ tiene una sesión de Supabase
  // viva sin Usuario establecido -- usePreventRemove() cancela esa sesión si el chofer vuelve
  // atrás por gesto/hardware antes de terminar (ver NuevaContrasenaScreen.tsx).
  NuevaContrasena: { correo: string };
  // spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50): NuevoCheckInScreen navega acá con
  // `{ screen: "CheckOut" }` tras un check-in exitoso, para dejar al chofer en esa pestaña en vez
  // de volver a Check-in (patrón oficial de React Navigation para enfocar una pestaña puntual de
  // un tab navigator anidado desde el stack que lo contiene).
  Principal: NavigatorScreenParams<TabsParamList> | undefined;
  // spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50): `abrirCheckOut` solo lo manda la
  // pestaña Check-out (tocar su tarjeta deja el formulario de cierre ya visible, sin un botón
  // intermedio) -- Historial sigue entrando sin este param, así que una jornada abierta vista
  // desde ahí se comporta exactamente igual que hoy (el botón de check-out, no el formulario).
  DetalleJornada: { id: string; abrirCheckOut?: boolean };
  NuevoCheckIn: undefined;
};

export type TabsParamList = {
  CheckIn: undefined;
  CheckOut: undefined;
  Historial: undefined;
};

export type RootStackNavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Las pantallas de los tabs necesitan navegar a rutas del stack raíz (ej.
// DetalleJornada), que no forman parte de TabsParamList — de ahí el
// composite en vez de un BottomTabNavigationProp simple.
export type TabsNavigationProp<T extends keyof TabsParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<TabsParamList, T>,
  RootStackNavigationProp
>;

export type DetalleJornadaRouteProp = RouteProp<RootStackParamList, "DetalleJornada">;
