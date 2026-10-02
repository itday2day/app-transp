import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { I18nextProvider } from "react-i18next";
import * as Font from "expo-font";
import { BigShouldersDisplay_700Bold } from "@expo-google-fonts/big-shoulders-display";
import { IBMPlexSans_400Regular, IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { AuthProvider } from "@/context/AuthContext";
import { NetworkProvider } from "@/context/NetworkContext";
import { RootNavigator } from "@/navigation/RootNavigator";
import { BannerConexion } from "@/components/BannerConexion";
import { obtenerBaseDeDatos } from "@/db/database";
import { cargarIdiomaGuardado } from "@/hooks/useIdioma";
import i18next from "@/i18n";

// spec_identidad_visual_day2day.md: se suma a la misma Promise.all que ya gateaba el arranque en
// `listo` (base de datos + idioma) — no hace falta expo-splash-screen ni un segundo mecanismo de
// carga, esto reutiliza el que ya existía.
function cargarFuentes() {
  return Font.loadAsync({
    BigShouldersDisplay_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_500Medium,
  });
}

export default function App() {
  const [listo, setListo] = useState(false);

  useEffect(() => {
    Promise.all([obtenerBaseDeDatos(), cargarIdiomaGuardado(), cargarFuentes()]).then(() => setListo(true));
  }, []);

  if (!listo) return null;

  return (
    <I18nextProvider i18n={i18next}>
      <SafeAreaProvider>
        <AuthProvider>
          <NetworkProvider>
            <SafeAreaView style={estilos.contenedor} edges={["top"]}>
              <BannerConexion />
              <View style={estilos.contenido}>
                <RootNavigator />
              </View>
            </SafeAreaView>
            <StatusBar style="dark" />
          </NetworkProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </I18nextProvider>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
  },
  contenido: {
    flex: 1,
  },
});
