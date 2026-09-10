import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  LayoutChangeEvent,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { obtenerJornadaPorId, registrarCheckOut } from "@/db/jornadasRepo";
import { useUbicacion } from "@/hooks/useUbicacion";
import { useNetwork } from "@/context/NetworkContext";
import { abrirMapa } from "@/services/mapasService";
import { CheckOutForm, ValoresCheckOutForm } from "@/components/CheckOutForm";
import { CLAVE_TIPO_INCIDENCIA } from "@/components/IncidenciasForm";
import { BannerConexion } from "@/components/BannerConexion";
import { BotonPrimario } from "@/components/BotonPrimario";
import { Jornada } from "@/types";
import { DetalleJornadaRouteProp, RootStackNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.filaEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.filaValor}>{valor}</Text>
    </View>
  );
}

// A diferencia de Fila (pensado para pares cortos "etiqueta: valor" en una
// fila), esto va en columna con la etiqueta arriba y el texto a ancho
// completo abajo — para que un mensaje largo (detalle de incidencia,
// observaciones) haga salto de línea en vez de desbordar el contenedor.
function FilaTexto({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={estilos.filaTexto}>
      <Text style={estilos.filaEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.filaTextoValor}>{valor}</Text>
    </View>
  );
}

function FilaUbicacion({
  etiqueta,
  lat,
  lng,
}: {
  etiqueta: string;
  lat: number | null | undefined;
  lng: number | null | undefined;
}) {
  const { t } = useTranslation();
  return (
    <View style={estilos.fila}>
      <Text style={estilos.filaEtiqueta}>{etiqueta}</Text>
      {lat != null && lng != null ? (
        <Pressable accessibilityRole="button" onPress={() => abrirMapa(lat, lng)} style={estilos.enlaceMapa}>
          <Ionicons name="location-outline" size={16} color={colores.primario} />
          <Text style={estilos.textoEnlaceMapa}>{t("detalleJornada.verEnMapa")}</Text>
        </Pressable>
      ) : (
        <Text style={estilos.textoUbicacionFaltante}>{t("detalleJornada.ubicacionNoRegistrada")}</Text>
      )}
    </View>
  );
}

export default function DetalleJornadaScreen() {
  const { params } = useRoute<DetalleJornadaRouteProp>();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { t } = useTranslation();
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [mostrarFormularioCheckOut, setMostrarFormularioCheckOut] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { capturarUbicacion, obteniendo: obteniendoUbicacion } = useUbicacion();
  const { conectado } = useNetwork();
  const refScroll = useRef<ScrollView>(null);
  const refKmFinal = useRef<TextInput>(null);
  const ySeccionCheckOut = useRef(0);

  useEffect(() => {
    obtenerJornadaPorId(params.id).then(setJornada);
  }, [params.id]);

  useEffect(() => {
    if (!mostrarFormularioCheckOut) return;
    refScroll.current?.scrollTo({ y: ySeccionCheckOut.current, animated: true });
    // ScrollView no expone un callback de "animación de scroll terminada" sin
    // sumar react-native-reanimated — se espera un tiempo calibrado a que
    // termine (~300-400ms) antes de enfocar, mismo criterio que el resto del
    // proyecto usa para esperar animaciones de apertura/cierre.
    const temporizador = setTimeout(() => refKmFinal.current?.focus(), 400);
    return () => clearTimeout(temporizador);
  }, [mostrarFormularioCheckOut]);

  function manejarLayoutSeccionCheckOut(evento: LayoutChangeEvent) {
    ySeccionCheckOut.current = Math.max(0, evento.nativeEvent.layout.y - espaciado.sm);
  }

  async function manejarEnvioCheckOut(valores: ValoresCheckOutForm) {
    if (!jornada) return;

    // No bloquea el check-out si falla la captura de GPS (sin señal, GPS
    // apagado, interior de un edificio): el chofer ya completó todo el
    // formulario, y el registro es local-first — mejor guardarlo con
    // ubicación nula (ver FilaUbicacion, ya maneja "no registrada") que
    // dejar al chofer sin poder cerrar su jornada hasta que el GPS responda.
    const ubicacion = await capturarUbicacion();

    setEnviando(true);
    try {
      await registrarCheckOut({
        id: jornada.id,
        ...valores,
        latFinal: ubicacion?.lat,
        lngFinal: ubicacion?.lng,
      });

      const mensajeExito = !conectado
        ? t("checkOutForm.exitoMensajeOffline")
        : !ubicacion
          ? t("checkOutForm.exitoMensajeSinUbicacion")
          : t("checkOutForm.exitoMensaje");
      Alert.alert(t("checkOutForm.exitoTitulo"), mensajeExito);
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        t("checkOutForm.errorRegistroTitulo"),
        err instanceof Error ? err.message : t("checkIn.errorGenerico")
      );
    } finally {
      setEnviando(false);
    }
  }

  if (!jornada) return null;

  return (
    <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <BannerConexion />
      <ScrollView
        ref={refScroll}
        style={estilos.pantalla}
        contentContainerStyle={estilos.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={estilos.titulo}>{jornada.matricula}</Text>
        <Text style={estilos.chofer}>{jornada.choferNombre}</Text>

        <View style={estilos.seccion}>
          <Text style={estilos.seccionTitulo}>{t("detalleJornada.seccionCheckIn")}</Text>
          <Fila
            etiqueta={t("detalleJornada.fechaHora")}
            valor={new Date(jornada.fechaCheckIn).toLocaleString("es-MX")}
          />
          <Fila etiqueta={t("detalleJornada.empresa")} valor={jornada.empresa} />
          <Fila etiqueta={t("detalleJornada.ruta")} valor={jornada.ruta} />
          {jornada.incidencias ? (
            <FilaTexto etiqueta={t("detalleJornada.incidencias")} valor={jornada.incidencias} />
          ) : null}
          <Fila etiqueta={t("detalleJornada.kmInicial")} valor={`${jornada.kmInicial} km`} />
          <Fila etiqueta={t("detalleJornada.combustible")} valor={`${jornada.combustibleInicial}%`} />
          <FilaUbicacion
            etiqueta={t("detalleJornada.ubicacion")}
            lat={jornada.latInicial}
            lng={jornada.lngInicial}
          />
          <View style={estilos.filaFotos}>
            <Image source={{ uri: jornada.fotoTacometroInicialUri }} style={estilos.foto} />
            {jornada.fotoRutaUri ? (
              <Image source={{ uri: jornada.fotoRutaUri }} style={estilos.foto} />
            ) : null}
          </View>
        </View>

        {jornada.estado === "cerrada" ? (
          <View style={estilos.seccion}>
            <Text style={estilos.seccionTitulo}>{t("detalleJornada.seccionCheckOut")}</Text>
            <Fila
              etiqueta={t("detalleJornada.fechaHora")}
              valor={jornada.fechaCheckOut ? new Date(jornada.fechaCheckOut).toLocaleString("es-MX") : "-"}
            />
            <Fila etiqueta={t("detalleJornada.kmFinal")} valor={`${jornada.kmFinal} km`} />
            <Fila
              etiqueta={t("detalleJornada.combustible")}
              valor={jornada.combustibleFinal != null ? `${jornada.combustibleFinal}%` : "-"}
            />
            <FilaUbicacion
              etiqueta={t("detalleJornada.ubicacion")}
              lat={jornada.latFinal}
              lng={jornada.lngFinal}
            />
            {jornada.fotoTacometroFinalUri ? (
              <Image source={{ uri: jornada.fotoTacometroFinalUri }} style={estilos.foto} />
            ) : null}
            <FilaTexto
              etiqueta={t("detalleJornada.incidencia")}
              valor={
                jornada.tuvoIncidencia
                  ? `${jornada.tipoIncidencia ? t(CLAVE_TIPO_INCIDENCIA[jornada.tipoIncidencia]) : "-"}${jornada.detalleIncidencia ? ` — ${jornada.detalleIncidencia}` : ""}`
                  : t("detalleJornada.sinIncidencias")
              }
            />
            {jornada.fotosIncidenciaUris && jornada.fotosIncidenciaUris.length > 0 ? (
              <View style={estilos.filaFotosIncidencia}>
                {jornada.fotosIncidenciaUris.map((uri) => (
                  <Image key={uri} source={{ uri }} style={estilos.fotoIncidencia} />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={estilos.seccion} onLayout={manejarLayoutSeccionCheckOut}>
            <Text style={estilos.seccionTitulo}>{t("detalleJornada.seccionCheckOut")}</Text>
            <Text style={estilos.textoAbierta}>{t("detalleJornada.jornadaEnCurso")}</Text>

            {mostrarFormularioCheckOut ? (
              <CheckOutForm
                ref={refKmFinal}
                jornada={jornada}
                onEnviar={manejarEnvioCheckOut}
                onCancelar={() => setMostrarFormularioCheckOut(false)}
                enviando={enviando || obteniendoUbicacion}
              />
            ) : (
              <BotonPrimario
                titulo={t("detalleJornada.botonCheckOut")}
                onPress={() => setMostrarFormularioCheckOut(true)}
                estilo={estilos.botonCheckOut}
              />
            )}
          </View>
        )}

        <Text style={estilos.estadoSincronizacion}>
          {t("detalleJornada.estadoEnvio")}{" "}
          {
            {
              pendiente: t("detalleJornada.sincPendiente"),
              sincronizando: t("detalleJornada.sincEnviando"),
              sincronizado: t("detalleJornada.sincEnviado"),
              error: t("detalleJornada.sincError"),
            }[jornada.sincronizacion]
          }
        </Text>
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
    paddingBottom: espaciado.xl,
  },
  titulo: {
    ...tipografia.titulo,
  },
  chofer: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    marginBottom: espaciado.md,
  },
  seccion: {
    backgroundColor: colores.superficie,
    borderRadius: radios.md,
    padding: espaciado.md,
    marginBottom: espaciado.md,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  seccionTitulo: {
    ...tipografia.subtitulo,
    marginBottom: espaciado.sm,
  },
  fila: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: espaciado.xs,
  },
  filaEtiqueta: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
  },
  filaValor: {
    ...tipografia.cuerpo,
    fontWeight: "600",
  },
  filaTexto: {
    paddingVertical: espaciado.xs,
  },
  filaTextoValor: {
    ...tipografia.cuerpo,
    fontWeight: "600",
    marginTop: espaciado.xs,
    flexShrink: 1,
  },
  enlaceMapa: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaciado.xs,
  },
  textoEnlaceMapa: {
    ...tipografia.cuerpo,
    color: colores.primario,
    fontWeight: "600",
  },
  textoUbicacionFaltante: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
  },
  filaFotos: {
    flexDirection: "row",
    gap: espaciado.sm,
    marginTop: espaciado.sm,
  },
  foto: {
    flex: 1,
    height: 120,
    borderRadius: radios.sm,
  },
  filaFotosIncidencia: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: espaciado.sm,
    marginTop: espaciado.sm,
  },
  fotoIncidencia: {
    width: 88,
    height: 88,
    borderRadius: radios.sm,
  },
  textoAbierta: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    marginBottom: espaciado.sm,
  },
  botonCheckOut: {
    marginTop: espaciado.xs,
  },
  estadoSincronizacion: {
    ...tipografia.ayuda,
    textAlign: "center",
    marginTop: espaciado.sm,
  },
});
