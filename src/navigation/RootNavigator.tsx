import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { ClaveTraduccion } from "@/i18n";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";
import { RootStackNavigationProp, RootStackParamList, TabsParamList } from "./types";

import LoginScreen from "@/screens/LoginScreen";
import RegistroScreen from "@/screens/RegistroScreen";
import CambiarContrasenaObligatorioScreen from "@/screens/CambiarContrasenaObligatorioScreen";
import CambiarContrasenaScreen from "@/screens/CambiarContrasenaScreen";
import CheckInScreen from "@/screens/CheckInScreen";
import HistorialScreen from "@/screens/HistorialScreen";
import DetalleJornadaScreen from "@/screens/DetalleJornadaScreen";
import NuevoCheckInScreen from "@/screens/NuevoCheckInScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

const ICONOS_TAB: Record<keyof TabsParamList, keyof typeof Ionicons.glyphMap> = {
  CheckIn: "log-in-outline",
  Historial: "time-outline",
};

const CLAVE_TITULO_TAB: Record<keyof TabsParamList, ClaveTraduccion> = {
  CheckIn: "navegacion.tabCheckIn",
  Historial: "navegacion.tabHistorial",
};

function PrincipalTabs() {
  const { cerrarSesion } = useAuth();
  const { t } = useTranslation();
  // Este componente es el que registra <Stack.Screen name="Principal" .../> más abajo, así que
  // useNavigation() acá devuelve el navigator del STACK raíz (no el de cada tab por separado) —
  // permite navegar a "CambiarContrasena", que vive en el stack, no en los tabs.
  const navigation = useNavigation<RootStackNavigationProp>();

  // ⚠️ Sin `tabBarStyle` a propósito: `BottomTabBar` (@react-navigation/bottom-tabs)
  // ya suma `insets.bottom` a su propio paddingBottom por defecto (confirmado
  // en su código fuente, no asumido) — reservar espacio para la barra de
  // gestos de Android en la barra de tabs en sí ya viene resuelto sin tocar
  // nada acá. Lo que sí hace falta (y no viene gratis) es el padding inferior
  // del CONTENIDO scrolleable de cada pantalla con tabs, para que el último
  // elemento de una lista no quede tapado por la barra de tabs — ver
  // `useBottomTabBarHeight()` en CheckInScreen.tsx/HistorialScreen.tsx.
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        title: t(CLAVE_TITULO_TAB[route.name as keyof TabsParamList]),
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONOS_TAB[route.name as keyof TabsParamList]} size={size} color={color} />
        ),
        tabBarActiveTintColor: colores.primario,
        tabBarInactiveTintColor: colores.textoSecundario,
        // "Contraseña" al lado de "Salir" (spec_deudas_app_movil.md): la app se usa con una
        // mano y en movimiento, así que la opción de cambiarla va lejos de los botones que se
        // tocan todos los días (Check-in, Historial), pegada a la de cerrar sesión.
        headerRight: () => (
          <View style={estilos.filaHeader}>
            <Pressable onPress={() => navigation.navigate("CambiarContrasena")} style={estilos.botonSalir}>
              <Text style={estilos.textoSalir}>{t("navegacion.cambiarContrasena")}</Text>
            </Pressable>
            <Pressable onPress={cerrarSesion} style={estilos.botonSalir}>
              <Text style={estilos.textoSalir}>{t("navegacion.salir")}</Text>
            </Pressable>
          </View>
        ),
      })}
    >
      <Tab.Screen name="CheckIn" component={CheckInScreen} />
      <Tab.Screen name="Historial" component={HistorialScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { usuario, cargando } = useAuth();
  const { t } = useTranslation();

  if (cargando) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {usuario?.debeCambiarContrasena ? (
          // Única pantalla del stack mientras esto sea true — ni el resto de rutas autenticadas
          // ni Login/Registro están montadas, así que no hay forma de "volver atrás" hacia
          // ellas ni de llegar a ninguna pantalla que cargue datos (Fase 2, Parte B de
          // spec_alta_choferes_dashboard.md).
          <Stack.Screen name="CambiarContrasenaObligatorio" component={CambiarContrasenaObligatorioScreen} />
        ) : usuario ? (
          <>
            <Stack.Screen name="Principal" component={PrincipalTabs} />
            <Stack.Screen
              name="DetalleJornada"
              component={DetalleJornadaScreen}
              options={{ headerShown: true, title: t("navegacion.tituloDetalleJornada") }}
            />
            <Stack.Screen
              name="NuevoCheckIn"
              component={NuevoCheckInScreen}
              options={{ headerShown: true, title: t("navegacion.tituloNuevoCheckIn") }}
            />
            <Stack.Screen
              name="CambiarContrasena"
              component={CambiarContrasenaScreen}
              options={{ headerShown: true, title: t("navegacion.tituloCambiarContrasena") }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen
              name="Registro"
              component={RegistroScreen}
              options={{ headerShown: true, title: t("registro.titulo") }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const estilos = StyleSheet.create({
  filaHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  botonSalir: {
    paddingVertical: espaciado.xs,
    marginRight: espaciado.md,
  },
  textoSalir: {
    ...tipografia.cuerpo,
    color: colores.primario,
    fontWeight: "600",
  },
});
