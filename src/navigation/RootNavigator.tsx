import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { ClaveTraduccion } from "@/i18n";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";
import { RootStackParamList, TabsParamList } from "./types";

import LoginScreen from "@/screens/LoginScreen";
import RegistroScreen from "@/screens/RegistroScreen";
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

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        title: t(CLAVE_TITULO_TAB[route.name as keyof TabsParamList]),
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONOS_TAB[route.name as keyof TabsParamList]} size={size} color={color} />
        ),
        tabBarActiveTintColor: colores.primario,
        tabBarInactiveTintColor: colores.textoSecundario,
        headerRight: () => (
          <Pressable onPress={cerrarSesion} style={estilos.botonSalir}>
            <Text style={estilos.textoSalir}>{t("navegacion.salir")}</Text>
          </Pressable>
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
        {usuario ? (
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
