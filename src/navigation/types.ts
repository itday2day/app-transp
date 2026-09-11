import { CompositeNavigationProp, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

export type RootStackParamList = {
  Login: undefined;
  Registro: undefined;
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
