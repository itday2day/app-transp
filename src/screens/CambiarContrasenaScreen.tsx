import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { BotonPrimario } from "@/components/BotonPrimario";
import { useAuth } from "@/context/AuthContext";
import { cambiarContrasenaVoluntaria } from "@/services/authService";
import { ErrorApi } from "@/services/api";
import { RootStackNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// Cambio de contraseña por voluntad propia (spec_deudas_app_movil.md, Parte A) — a diferencia de
// CambiarContrasenaObligatorioScreen (que bloquea toda la app hasta que se complete), esta
// pantalla es una más del stack normal, con su propia flecha de "volver": el chofer entra cuando
// quiere, no porque algo se lo exija. No toca la sesión ni la base local (ver el comentario largo
// en cambiarContrasenaVoluntaria(), authService.ts) — se puede usar con una jornada abierta sin
// ningún riesgo para ella.
export default function CambiarContrasenaScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { usuario } = useAuth();

  const [contrasenaActual, setContrasenaActual] = useState("");
  const [contrasenaNueva, setContrasenaNueva] = useState("");
  const [confirmarContrasenaNueva, setConfirmarContrasenaNueva] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  const contrasenasCoinciden =
    confirmarContrasenaNueva.length === 0 || confirmarContrasenaNueva === contrasenaNueva;
  const puedeEnviar =
    contrasenaActual.length > 0 &&
    contrasenaNueva.length >= 6 &&
    confirmarContrasenaNueva === contrasenaNueva;

  async function manejarCambio() {
    if (!puedeEnviar || !usuario) return;
    setError(null);
    setEnviando(true);
    try {
      await cambiarContrasenaVoluntaria(usuario.numeroEmpleado, contrasenaActual, contrasenaNueva);
      setExito(true);
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 401) {
        setError(t("cambiarContrasena.errorContrasenaActual"));
      } else {
        setError(t("cambiarContrasena.errorGenerico"));
      }
    } finally {
      setEnviando(false);
    }
  }

  if (exito) {
    return (
      <View style={estilos.pantalla}>
        <Text style={estilos.titulo}>{t("cambiarContrasena.exitoTitulo")}</Text>
        <Text style={estilos.mensaje}>{t("cambiarContrasena.exitoMensaje")}</Text>
        <BotonPrimario
          titulo={t("cambiarContrasena.botonVolver")}
          onPress={() => navigation.goBack()}
          estilo={estilos.boton}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={estilos.subtitulo}>{t("cambiarContrasena.subtitulo")}</Text>

        <CampoTexto
          etiqueta={t("cambiarContrasena.contrasenaActualEtiqueta")}
          placeholder={t("cambiarContrasena.contrasenaActualPlaceholder")}
          secureTextEntry
          autoCapitalize="none"
          value={contrasenaActual}
          onChangeText={setContrasenaActual}
        />

        <CampoTexto
          etiqueta={t("cambiarContrasena.contrasenaNuevaEtiqueta")}
          placeholder={t("cambiarContrasena.contrasenaNuevaPlaceholder")}
          secureTextEntry
          autoCapitalize="none"
          value={contrasenaNueva}
          onChangeText={setContrasenaNueva}
        />

        <CampoTexto
          etiqueta={t("cambiarContrasena.confirmarContrasenaNuevaEtiqueta")}
          placeholder={t("cambiarContrasena.confirmarContrasenaNuevaPlaceholder")}
          secureTextEntry
          autoCapitalize="none"
          value={confirmarContrasenaNueva}
          onChangeText={setConfirmarContrasenaNueva}
          error={!contrasenasCoinciden ? t("cambiarContrasena.contrasenasNoCoinciden") : undefined}
        />

        {/* Una línea, antes de confirmar — no una advertencia después (pedido explícito de la
            spec): si el chofer olvida la contraseña nueva, nadie puede devolvérsela. */}
        <Text style={estilos.aviso}>{t("cambiarContrasena.avisoSinRecuperacion")}</Text>

        {error ? <Text style={estilos.error}>{error}</Text> : null}

        <BotonPrimario
          titulo={t("cambiarContrasena.botonCambiar")}
          onPress={manejarCambio}
          cargando={enviando}
          deshabilitado={!puedeEnviar}
          estilo={estilos.boton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
    justifyContent: "center",
    padding: espaciado.lg,
  },
  contenido: {
    padding: espaciado.lg,
    paddingBottom: espaciado.xl,
  },
  titulo: {
    ...tipografia.titulo,
    textAlign: "center",
  },
  subtitulo: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    marginBottom: espaciado.lg,
  },
  mensaje: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    textAlign: "center",
    marginTop: espaciado.md,
    marginBottom: espaciado.xl,
  },
  aviso: {
    ...tipografia.ayuda,
    color: colores.textoSecundario,
    marginTop: espaciado.sm,
    marginBottom: espaciado.md,
  },
  error: {
    ...tipografia.cuerpo,
    color: colores.peligro,
    marginBottom: espaciado.md,
    textAlign: "center",
  },
  boton: {
    marginTop: espaciado.sm,
  },
});
