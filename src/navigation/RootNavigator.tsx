import React from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { TextoEnlace } from "@/components/TextoEnlace";
import { ClaveTraduccion } from "@/i18n";
import { colores } from "@/theme/colors";
import { espaciado } from "@/theme/spacing";
import { RootStackParamList, TabsParamList } from "./types";

import LoginScreen from "@/screens/LoginScreen";
import CambiarContrasenaObligatorioScreen from "@/screens/CambiarContrasenaObligatorioScreen";
import CambiarContrasenaScreen from "@/screens/CambiarContrasenaScreen";
import CodigoVerificacionScreen from "@/screens/CodigoVerificacionScreen";
import RecuperarContrasenaScreen from "@/screens/RecuperarContrasenaScreen";
import NuevaContrasenaScreen from "@/screens/NuevaContrasenaScreen";
import CheckInScreen from "@/screens/CheckInScreen";
import CheckOutScreen from "@/screens/CheckOutScreen";
import HistorialScreen from "@/screens/HistorialScreen";
import DetalleJornadaScreen from "@/screens/DetalleJornadaScreen";
import NuevoCheckInScreen from "@/screens/NuevoCheckInScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

const ICONOS_TAB: Record<keyof TabsParamList, keyof typeof Ionicons.glyphMap> = {
  CheckIn: "log-in-outline",
  CheckOut: "log-out-outline",
  Historial: "time-outline",
};

const CLAVE_TITULO_TAB: Record<keyof TabsParamList, ClaveTraduccion> = {
  CheckIn: "navegacion.tabCheckIn",
  CheckOut: "navegacion.tabCheckOut",
  Historial: "navegacion.tabHistorial",
};

function PrincipalTabs() {
  const { cerrarSesion } = useAuth();
  const { t } = useTranslation();

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
        // spec_cambio_contrasena_login.md: el botón "Contraseña" que vivía acá se retiró — el
        // cambio voluntario ahora se hace desde Login (sin sesión), única vía para esa acción.
        headerRight: () => (
          <View style={estilos.filaHeader}>
            {/* spec_bloque_a_pantallas_checkin_checkout.md (ampliación, E3): mismo componente y
                color de enlace que ya usa "Ver en mapa" (Hallazgo #49) -- un solo patrón de
                enlace en toda la app, nunca un estilo aparte para este botón. */}
            <TextoEnlace texto={t("navegacion.salir")} onPress={cerrarSesion} />
          </View>
        ),
      })}
    >
      <Tab.Screen name="CheckIn" component={CheckInScreen} />
      <Tab.Screen name="CheckOut" component={CheckOutScreen} />
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
          // ni Login/CambiarContrasena están montadas, así que no hay forma de "volver atrás"
          // hacia ellas ni de llegar a ninguna pantalla que cargue datos (Fase 2, Parte B de
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
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            {/* spec_cambio_contrasena_login.md: reemplaza a "Registro" (RegistroScreen.tsx,
                eliminada) — el cambio voluntario de contraseña ahora se alcanza sin sesión desde
                acá, en vez de solo después de haber iniciado sesión. */}
            <Stack.Screen
              name="CambiarContrasena"
              component={CambiarContrasenaScreen}
              options={{ headerShown: true, title: t("navegacion.tituloCambiarContrasena") }}
            />
            {/* spec_app_registro_paso5.md, paso 2c-1: headerShown:true (no false, como Login) a
                propósito -- el botón/gesto de volver atrás del sistema es el comportamiento que se
                quiere acá (sin ninguna sesión de Supabase pendiente que cancelar en el camino
                "signup", ver CodigoVerificacionScreen.tsx), así que no hace falta headerShown:false
                ni ningún manejo propio de back. */}
            <Stack.Screen
              name="CodigoVerificacion"
              component={CodigoVerificacionScreen}
              options={{ headerShown: true, title: t("codigo.titulo") }}
            />
            {/* paso 2c-2: sin sesión antes de este punto -- comportamiento de back por defecto. */}
            <Stack.Screen
              name="RecuperarContrasena"
              component={RecuperarContrasenaScreen}
              options={{ headerShown: true, title: t("recuperarContrasena.titulo") }}
            />
            {/* paso 2c-2 (R1): NO headerShown:false -- el botón de atrás del header sigue
                disponible, y usePreventRemove() (NuevaContrasenaScreen.tsx) intercepta tanto esa
                flecha como el gesto/físico, cancelando la sesión de recuperación pendiente antes
                de dejar pasar la navegación. */}
            <Stack.Screen
              name="NuevaContrasena"
              component={NuevaContrasenaScreen}
              options={{ headerShown: true, title: t("nuevaContrasena.titulo") }}
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
    marginRight: espaciado.sm,
  },
});
