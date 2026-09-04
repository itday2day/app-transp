import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { I18nextProvider } from "react-i18next";
import { AuthProvider } from "@/context/AuthContext";
import { NetworkProvider } from "@/context/NetworkContext";
import { RootNavigator } from "@/navigation/RootNavigator";
import { BannerConexion } from "@/components/BannerConexion";
import { obtenerBaseDeDatos } from "@/db/database";
import { cargarIdiomaGuardado } from "@/hooks/useIdioma";
import i18next from "@/i18n";

export default function App() {
  const [listo, setListo] = useState(false);

  useEffect(() => {
    Promise.all([obtenerBaseDeDatos(), cargarIdiomaGuardado()]).then(() => setListo(true));
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
