import React, { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { useUbicacion } from "@/hooks/useUbicacion";
import { useMatriculasFrecuentes } from "@/hooks/useMatriculasFrecuentes";
import { CheckInForm, ValoresCheckInForm } from "@/components/CheckInForm";
import { BotonPrimario } from "@/components/BotonPrimario";
import { crearCheckIn } from "@/db/jornadasRepo";
import { RootStackNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, ESPACIO_EXTRA_TECLADO } from "@/theme/spacing";

// Pantalla exclusiva para iniciar una ruta nueva — antes el formulario se
// revelaba inline dentro de CheckInScreen (que también muestra la lista de
// rutas activas), sin ninguna forma de cancelar salvo enviarlo. Separarlo en
// su propia pantalla de stack le da botón "Atrás" nativo (header, como
// DetalleJornadaScreen/RegistroScreen) + un botón "Cancelar" explícito, y dejó
// CheckInScreen enfocada solo en la lista. useJornadasAbiertas() en
// CheckInScreen ya usa useFocusEffect, así que la lista se refresca sola al
// volver acá con goBack() tras un check-in exitoso — no hace falta pasar
// ningún callback de refresco entre pantallas.
export default function NuevoCheckInScreen() {
  const navigation = useNavigation<RootStackNavigationProp>();
  const { t } = useTranslation();
  const { usuario } = useAuth();
  const { matriculas: matriculasFrecuentes } = useMatriculasFrecuentes();
  const { capturarUbicacion, obteniendo: obteniendoUbicacion } = useUbicacion();
  const [enviando, setEnviando] = useState(false);
  const refScroll = useRef<ScrollView>(null);

  async function manejarEnvioFormulario(valores: ValoresCheckInForm) {
    if (!usuario) return;

    const ubicacion = await capturarUbicacion();
    if (!ubicacion) {
      Alert.alert(t("checkIn.errorUbicacionTitulo"), t("checkIn.errorUbicacionMensaje"));
      return;
    }

    setEnviando(true);
    try {
      await crearCheckIn(
        {
          ...valores,
          latInicial: ubicacion.lat,
          lngInicial: ubicacion.lng,
        },
        usuario
      );

      Alert.alert(t("checkIn.exitoTitulo"), t("checkIn.exitoMensaje"));
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        t("checkIn.errorRegistroTitulo"),
        err instanceof Error ? err.message : t("checkIn.errorGenerico")
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        ref={refScroll}
        style={estilos.pantalla}
        contentContainerStyle={estilos.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={estilos.subtitulo}>{t("checkIn.subtituloFormulario")}</Text>

        <CheckInForm
          onEnviar={manejarEnvioFormulario}
          enviando={enviando || obteniendoUbicacion}
          matriculasFrecuentes={matriculasFrecuentes}
          scrollViewRef={refScroll}
        />

        <BotonPrimario
          titulo={t("comun.cancelar")}
          onPress={() => navigation.goBack()}
          variante="secundario"
          deshabilitado={enviando}
          estilo={estilos.botonCancelar}
        />
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
    padding: espaciado.lg,
    // Incidencias es el último campo del formulario — sin este espacio
    // extra, el ScrollView no tiene contenido de sobra debajo como para
    // scrollearlo arriba del teclado por completo (ver ESPACIO_EXTRA_TECLADO).
    paddingBottom: ESPACIO_EXTRA_TECLADO,
  },
  subtitulo: {
    ...tipografia.subtitulo,
    marginBottom: espaciado.sm,
  },
  botonCancelar: {
    marginTop: espaciado.sm,
  },
});
