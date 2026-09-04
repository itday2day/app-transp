import React, { useState } from "react";
import { View, Text, FlatList, ScrollView, StyleSheet, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { useUbicacion } from "@/hooks/useUbicacion";
import { useJornadasAbiertas } from "@/hooks/useJornadasAbiertas";
import { useMatriculasFrecuentes } from "@/hooks/useMatriculasFrecuentes";
import { useSeguimientoGPS } from "@/hooks/useSeguimientoGPS";
import { CheckInForm, ValoresCheckInForm } from "@/components/CheckInForm";
import { TarjetaJornada } from "@/components/TarjetaJornada";
import { BotonPrimario } from "@/components/BotonPrimario";
import { crearCheckIn } from "@/db/jornadasRepo";
import { TabsNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

export default function CheckInScreen() {
  const navigation = useNavigation<TabsNavigationProp<"CheckIn">>();
  const { t } = useTranslation();
  const { usuario } = useAuth();
  const { jornadas: viajesActivos, cargando: cargandoViajes, recargar } = useJornadasAbiertas();
  const { matriculas: matriculasFrecuentes } = useMatriculasFrecuentes();
  const { capturarUbicacion, obteniendo: obteniendoUbicacion } = useUbicacion();
  const [enviando, setEnviando] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  // Mientras haya al menos una ruta activa y la app esté en primer plano, se
  // envían pings de posición al Dashboard en tiempo real (ver useSeguimientoGPS).
  useSeguimientoGPS(viajesActivos.map((jornada) => jornada.id));

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
      setMostrarFormulario(false);
      await recargar();
    } catch (err) {
      Alert.alert(
        t("checkIn.errorRegistroTitulo"),
        err instanceof Error ? err.message : t("checkIn.errorGenerico")
      );
    } finally {
      setEnviando(false);
    }
  }

  if (cargandoViajes) return null;

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.titulo}>{t("checkIn.titulo")}</Text>
      <Text style={estilos.chofer}>{t("checkIn.chofer", { nombre: usuario?.nombre ?? "" })}</Text>

      {viajesActivos.length > 0 ? (
        <View style={estilos.bloqueActivos}>
          <Text style={estilos.subtitulo}>
            {t("checkIn.rutasActivas", { cantidad: viajesActivos.length })}
          </Text>
          <FlatList
            data={viajesActivos}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TarjetaJornada
                jornada={item}
                onPress={() => navigation.navigate("DetalleJornada", { id: item.id })}
              />
            )}
          />
        </View>
      ) : null}

      {mostrarFormulario ? (
        <>
          <Text style={estilos.subtitulo}>{t("checkIn.subtituloFormulario")}</Text>
          <CheckInForm
            onEnviar={manejarEnvioFormulario}
            enviando={enviando || obteniendoUbicacion}
            matriculasFrecuentes={matriculasFrecuentes}
          />
        </>
      ) : (
        <BotonPrimario
          titulo={t(viajesActivos.length > 0 ? "checkIn.botonNuevaRuta" : "checkIn.botonPrimeraRuta")}
          onPress={() => setMostrarFormulario(true)}
          estilo={estilos.botonNuevaRuta}
        />
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
  },
  contenido: {
    padding: espaciado.lg,
    paddingBottom: espaciado.xl,
  },
  titulo: {
    ...tipografia.titulo,
  },
  chofer: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    marginTop: espaciado.xs,
    marginBottom: espaciado.lg,
  },
  bloqueActivos: {
    marginBottom: espaciado.lg,
  },
  subtitulo: {
    ...tipografia.subtitulo,
    marginBottom: espaciado.sm,
  },
  botonNuevaRuta: {
    marginTop: espaciado.sm,
  },
});
