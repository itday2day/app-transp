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

// Cambio de contraseña por voluntad propia (spec_cambio_contrasena_login.md, reemplaza al punto
// de entrada post-login de spec_deudas_app_movil.md Parte A) — única vía para cambiarla estando
// ya elegida por el propio chofer (dos caminos para lo mismo era el patrón del Hallazgo #21).
// Vive en el stack SIN sesión, junto a Login: por eso pide numeroEmpleado (antes lo tomaba de
// useAuth().usuario, que acá todavía no existe) y, al confirmar, entra a la app llamando al mismo
// iniciarSesion() que usa un login normal — no solo abre una sesión de Supabase, reproduce
// EXACTAMENTE lo mismo que un login (perfil, SecureStore, y todo lo que reacciona a que `usuario`
// deje de ser null: sincronización de jornadas incluida, ver useJornadasAbiertas/NetworkContext).
// Se puede usar con una jornada abierta sin riesgo para ella: ni esto ni cambiarContrasenaVoluntaria
// tocan SQLite (ver el comentario largo en esa función, authService.ts).
export default function CambiarContrasenaScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { iniciarSesion } = useAuth();

  const [numeroEmpleado, setNumeroEmpleado] = useState("");
  const [contrasenaActual, setContrasenaActual] = useState("");
  const [contrasenaNueva, setContrasenaNueva] = useState("");
  const [confirmarContrasenaNueva, setConfirmarContrasenaNueva] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Solo se llega acá si la contraseña SÍ cambió pero el auto-login de después falló (ej. un hipo
  // de red justo en ese instante) — no es un estado de error del cambio en sí, así que no reusa
  // `error`: le dice al chofer que ya puede entrar a mano con la contraseña nueva.
  const [exito, setExito] = useState(false);

  const contrasenasCoinciden =
    confirmarContrasenaNueva.length === 0 || confirmarContrasenaNueva === contrasenaNueva;
  const puedeEnviar =
    numeroEmpleado.trim().length > 0 &&
    contrasenaActual.length > 0 &&
    contrasenaNueva.length >= 6 &&
    confirmarContrasenaNueva === contrasenaNueva;

  async function manejarCambio() {
    if (!puedeEnviar) return;
    setError(null);
    setEnviando(true);
    try {
      await cambiarContrasenaVoluntaria(numeroEmpleado.trim(), contrasenaActual, contrasenaNueva);
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 401) {
        setError(t("cambiarContrasena.errorContrasenaActual"));
      } else {
        setError(t("cambiarContrasena.errorGenerico"));
      }
      setEnviando(false);
      return;
    }
    try {
      // Mismo iniciarSesion() que llama LoginScreen — no una versión propia (ver comentario de
      // arriba). Al resolver, RootNavigator.tsx cambia de stack solo (usuario deja de ser null):
      // no hace falta navegar a mano.
      await iniciarSesion(numeroEmpleado.trim(), contrasenaNueva);
    } catch {
      setExito(true);
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
          etiqueta={t("cambiarContrasena.numeroEmpleadoEtiqueta")}
          placeholder={t("cambiarContrasena.numeroEmpleadoPlaceholder")}
          keyboardType="number-pad"
          autoCapitalize="none"
          value={numeroEmpleado}
          onChangeText={setNumeroEmpleado}
        />

        <CampoTexto
          etiqueta={t("cambiarContrasena.contrasenaActualEtiqueta")}
          placeholder={t("cambiarContrasena.contrasenaActualPlaceholder")}
          secureTextEntry
          alternarVisibilidad
          autoCapitalize="none"
          value={contrasenaActual}
          onChangeText={setContrasenaActual}
        />

        <CampoTexto
          etiqueta={t("cambiarContrasena.contrasenaNuevaEtiqueta")}
          placeholder={t("cambiarContrasena.contrasenaNuevaPlaceholder")}
          secureTextEntry
          alternarVisibilidad
          autoCapitalize="none"
          value={contrasenaNueva}
          onChangeText={setContrasenaNueva}
        />

        <CampoTexto
          etiqueta={t("cambiarContrasena.confirmarContrasenaNuevaEtiqueta")}
          placeholder={t("cambiarContrasena.confirmarContrasenaNuevaPlaceholder")}
          secureTextEntry
          alternarVisibilidad
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
