import { CompositeNavigationProp, NavigatorScreenParams, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

export type RootStackParamList = {
  Login: undefined;
  // spec_app_registro_paso5.md, paso 2c-3: reintroduce el registro propio (Hallazgo #51) -- NO es
  // la vieja RegistroScreen.tsx (eliminada por spec_cambio_contrasena_login.md), es un camino
  // nuevo por invitación. `token` opcional (32 hex, del deep link `apptransp://invitacion/:token`,
  // 2c-3 último commit) -- si falta, la pantalla pide el código de 8 a mano. NUNCA un código de
  // invitación de 8 caracteres en route.params persistentes -- ese lo tipea el chofer dentro de la
  // pantalla misma, nunca viaja por navegación.
  Registro: { token?: string } | undefined;
  CambiarContrasenaObligatorio: undefined;
  // spec_app_registro_paso5.md, pasos 2c-1/2c-2: `correo` es el ÚNICO dato no sensible que
  // necesita esta pantalla (se muestra en pantalla: "te enviamos un código a {{correo}}") --
  // NUNCA una contraseña ni un código acá (criterio 10, nada sensible en route.params
  // persistentes). `tipo` decide qué llama verificarCodigo()/reenviarCodigo()/pedirRecuperacion()
  // ("signup" = registro/correoSinConfirmar, "recovery" = recuperación de contraseña -- los dos
  // ya implementados). `origen` matiza el arranque de la cuenta regresiva (ver
  // CodigoVerificacionScreen.tsx: "login" arranca en 0s, los otros dos en 60s porque YA se mandó
  // un correo al llegar) y decide el botón "Olvidé mi contraseña", que solo aparece con
  // `tipo==="signup" && origen==="login"` (correoSinConfirmar) -- nunca con origen:"recuperacion"
  // ni origen:"registro", donde no tiene sentido ofrecer esa salida.
  CodigoVerificacion: {
    correo: string;
    tipo: "signup" | "recovery";
    origen: "registro" | "login" | "recuperacion";
  };
  // spec_app_registro_paso5.md, paso 2c-2: pide el correo (resetPasswordForEmail/pedirRecuperacion)
  // y navega a CodigoVerificacion({correo, tipo:"recovery", origen:"recuperacion"}) -- sin params
  // propios. "Olvidé mi contraseña" desde la pantalla de código (origen:"login") llega al MISMO
  // destino pero con origen:"recuperacion" (no "login"): ya se mandó un correo real desde ahí, la
  // cuenta regresiva de la pantalla destino debe arrancar en 60s, no en 0 (ver M1,
  // CodigoVerificacionScreen.tsx).
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
