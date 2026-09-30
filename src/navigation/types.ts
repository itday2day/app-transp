import { CompositeNavigationProp, RouteProp } from "@react-navigation/native";
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
  Principal: undefined;
  DetalleJornada: { id: string };
  NuevoCheckIn: undefined;
};

export type TabsParamList = {
  CheckIn: undefined;
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
