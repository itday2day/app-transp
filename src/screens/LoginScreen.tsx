import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { CampoTexto } from "@/components/CampoTexto";
import { BotonPrimario } from "@/components/BotonPrimario";
import { LanguageSelector } from "@/components/LanguageSelector";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";
import { ErrorApi } from "@/services/api";
import { RootStackNavigationProp } from "@/navigation/types";

export default function LoginScreen() {
  const navigation = useNavigation<RootStackNavigationProp>();
  const { t } = useTranslation();
  const { iniciarSesion } = useAuth();
  const [numeroEmpleado, setNumeroEmpleado] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEnviar = numeroEmpleado.trim().length > 0 && contrasena.length > 0;

  async function manejarIngreso() {
    if (!puedeEnviar) return;
    setError(null);
    setCargando(true);
    try {
      await iniciarSesion(numeroEmpleado.trim(), contrasena);
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 401) {
        setError(t("login.errorCredenciales"));
      } else {
        setError(t("login.errorConexion"));
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* spec_marca_agua_y_navegacion_day2day.md (Hallazgo #42): marca de agua, renderizada ANTES
          del ScrollView (y no encima) para que este, al pintarse después, quede arriba sin
          necesitar zIndex. pointerEvents="none" + accessible={false} +
          importantForAccessibility/accessibilityElementsHidden: no intercepta toques ni lectores
          de pantalla. position:"relative" de `pantalla` (default de RN) es lo que ancla este
          absolute a la pantalla completa. */}
      <Image
        source={require("../../assets/isotipo-d2d.png")}
        style={estilos.marcaAgua}
        resizeMode="contain"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />

      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        {/* Fuera del bloque centrado (antes quedaba pegado encima del logo, en el medio de la
            pantalla) — ahora es el primer elemento del scroll, arriba del todo. */}
        <View style={estilos.filaIdioma}>
          <LanguageSelector />
        </View>

        <View style={estilos.bloqueCentral}>
          <View style={estilos.encabezado}>
            <Image
              source={require("../../assets/logo-negro.png")}
              style={estilos.logo}
              resizeMode="contain"
              accessibilityLabel="Day2Day Solutions"
            />
            <Text style={estilos.subtitulo}>{t("login.subtitulo")}</Text>
          </View>

          <CampoTexto
            etiqueta={t("login.numeroEmpleadoEtiqueta")}
            placeholder={t("login.numeroEmpleadoPlaceholder")}
            keyboardType="number-pad"
            autoCapitalize="none"
            value={numeroEmpleado}
            onChangeText={setNumeroEmpleado}
          />

          <CampoTexto
            etiqueta={t("login.contrasenaEtiqueta")}
            placeholder={t("login.contrasenaPlaceholder")}
            secureTextEntry
            alternarVisibilidad
            autoCapitalize="none"
            value={contrasena}
            onChangeText={setContrasena}
          />

          {error ? <Text style={estilos.error}>{error}</Text> : null}

          <BotonPrimario
            titulo={t("login.botonIngresar")}
            onPress={manejarIngreso}
            cargando={cargando}
            deshabilitado={!puedeEnviar}
            estilo={estilos.boton}
          />

          <Pressable onPress={() => navigation.navigate("CambiarContrasena")}>
            <Text style={estilos.enlace}>{t("login.ayudaContrasena")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
  },
  contenido: {
    flexGrow: 1,
    padding: espaciado.lg,
  },
  marcaAgua: {
    position: "absolute",
    right: -30,
    bottom: -30,
    width: "100%",
    aspectRatio: 899 / 299,
    opacity: 0.05,
  },
  filaIdioma: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: espaciado.md,
  },
  // Antes del centrado, `contenido` (el ScrollView) ya no tiene justifyContent: "center" —
  // ese centrado pasa a este bloque (flex: 1 dentro de un padre flexGrow: 1), así el selector de
  // idioma de arriba queda fijo y solo lo de abajo se centra en el espacio que le queda.
  bloqueCentral: {
    flex: 1,
    justifyContent: "center",
  },
  encabezado: {
    marginBottom: espaciado.xl,
    alignItems: "center",
  },
  logo: {
    width: 220,
    height: 56,
  },
  subtitulo: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    textAlign: "center",
    marginTop: espaciado.xs,
  },
  boton: {
    marginTop: espaciado.sm,
  },
  error: {
    ...tipografia.cuerpo,
    color: colores.peligro,
    marginBottom: espaciado.md,
    textAlign: "center",
  },
  enlace: {
    ...tipografia.cuerpo,
    color: colores.primario,
    fontWeight: "600",
    textAlign: "center",
    marginTop: espaciado.lg,
  },
});
