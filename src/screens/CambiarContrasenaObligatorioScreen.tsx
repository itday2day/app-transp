import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { BotonPrimario } from "@/components/BotonPrimario";
import { useAuth } from "@/context/AuthContext";
import { cambiarContrasenaObligatoria } from "@/services/authService";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// Única pantalla accesible mientras usuario.debeCambiarContrasena sea true (RootNavigator.tsx) —
// sin tabs, sin forma de navegar a otro lado salvo cerrar sesión. El chofer llega acá con la
// contraseña temporal que le dictó su administrador (creada o reseteada desde el Dashboard,
// spec_alta_choferes_dashboard.md) y no puede cargar ninguna jornada hasta reemplazarla — es el
// punto entero del ejercicio: que el administrador deje de conocer la contraseña del chofer.
export default function CambiarContrasenaObligatorioScreen() {
  const { t } = useTranslation();
  const { cerrarSesion, marcarContrasenaCambiada } = useAuth();

  const [contrasena, setContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contrasenasCoinciden = confirmarContrasena.length === 0 || confirmarContrasena === contrasena;
  const puedeEnviar = contrasena.length >= 6 && confirmarContrasena === contrasena;

  async function manejarCambio() {
    if (!puedeEnviar) return;
    setError(null);
    setEnviando(true);
    try {
      await cambiarContrasenaObligatoria(contrasena);
      await marcarContrasenaCambiada();
    } catch {
      setError(t("cambiarContrasenaObligatorio.errorGenerico"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>{t("cambiarContrasenaObligatorio.titulo")}</Text>
        <Text style={estilos.subtitulo}>{t("cambiarContrasenaObligatorio.subtitulo")}</Text>

        <CampoTexto
          etiqueta={t("cambiarContrasenaObligatorio.contrasenaEtiqueta")}
          placeholder={t("cambiarContrasenaObligatorio.contrasenaPlaceholder")}
          secureTextEntry
          autoCapitalize="none"
          value={contrasena}
          onChangeText={setContrasena}
        />

        <CampoTexto
          etiqueta={t("cambiarContrasenaObligatorio.confirmarContrasenaEtiqueta")}
          placeholder={t("cambiarContrasenaObligatorio.confirmarContrasenaPlaceholder")}
          secureTextEntry
          autoCapitalize="none"
          value={confirmarContrasena}
          onChangeText={setConfirmarContrasena}
          error={!contrasenasCoinciden ? t("cambiarContrasenaObligatorio.contrasenasNoCoinciden") : undefined}
        />

        {error ? <Text style={estilos.error}>{error}</Text> : null}

        <BotonPrimario
          titulo={t("cambiarContrasenaObligatorio.botonCambiar")}
          onPress={manejarCambio}
          cargando={enviando}
          deshabilitado={!puedeEnviar}
          estilo={estilos.boton}
        />

        <View style={estilos.pieContenedor}>
          <BotonPrimario titulo={t("navegacion.salir")} onPress={cerrarSesion} variante="secundario" />
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
    justifyContent: "center",
    padding: espaciado.lg,
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
    marginBottom: espaciado.lg,
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
  pieContenedor: {
    marginTop: espaciado.xl,
  },
});
