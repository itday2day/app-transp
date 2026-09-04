import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
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
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <View style={estilos.filaIdioma}>
          <LanguageSelector />
        </View>

        <View style={estilos.encabezado}>
          <Text style={estilos.titulo}>{t("login.titulo")}</Text>
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

        <Pressable onPress={() => navigation.navigate("Registro")}>
          <Text style={estilos.enlace}>{t("login.enlaceRegistro")}</Text>
        </Pressable>

        <Text style={estilos.ayuda}>{t("login.ayudaContrasena")}</Text>
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
    justifyContent: "center",
    padding: espaciado.lg,
  },
  filaIdioma: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: espaciado.md,
  },
  encabezado: {
    marginBottom: espaciado.xl,
  },
  titulo: {
    ...tipografia.titulo,
    textAlign: "center",
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
  ayuda: {
    ...tipografia.ayuda,
    textAlign: "center",
    marginTop: espaciado.lg,
  },
  enlace: {
    ...tipografia.cuerpo,
    color: colores.primario,
    fontWeight: "600",
    textAlign: "center",
    marginTop: espaciado.lg,
  },
});
