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
  StyleProp,
  ImageStyle,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { obtenerJornadaPorId, registrarCheckOut } from "@/db/jornadasRepo";
import { useUbicacion } from "@/hooks/useUbicacion";
import { useNetwork } from "@/context/NetworkContext";
import { MAX_INTENTOS } from "@/services/syncService";
import { abrirMapa } from "@/services/mapasService";
import { CheckOutForm, ValoresCheckOutForm } from "@/components/CheckOutForm";
import { CLAVE_TIPO_INCIDENCIA } from "@/components/IncidenciasForm";
import { BannerConexion } from "@/components/BannerConexion";
import { BotonPrimario } from "@/components/BotonPrimario";
import { TextoEnlace } from "@/components/TextoEnlace";
import { VisorFotoAmpliada } from "@/components/VisorFotoAmpliada";
import { useFuenteFoto } from "@/hooks/useFuenteFoto";
import { Jornada } from "@/types";
import { textoEmpresa } from "@/utils/jornada";
import { DetalleJornadaRouteProp, RootStackNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios, ESPACIO_EXTRA_TECLADO } from "@/theme/spacing";

interface FotoPar {
  uri?: string;
  url?: string;
}

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
        <TextoEnlace texto={t("detalleJornada.verEnMapa")} onPress={() => abrirMapa(lat, lng)} externo />
      ) : (
        <Text style={estilos.textoUbicacionFaltante}>{t("detalleJornada.ubicacionNoRegistrada")}</Text>
      )}
    </View>
  );
}

// Se instancia con `key={uri}|${url}` desde cada lugar que la usa (ver más abajo) -- así React
// remonta una instancia nueva (useFuenteFoto vuelve a cero) cada vez que cambia cuál foto está
// mostrando, en vez de necesitar un efecto que resetee el estado a mano.
//
// spec_mejoras_carga_jornada_fotos_enlaces.md (Pedido 3): `onAbrir` solo se conecta cuando ya hay
// una fuente mostrándose con éxito (criterio 10: nunca abrir el visor sobre un hueco) -- mientras
// se está probando una fuente o ninguna cargó, la miniatura no es tocable.
function FotoEvidencia({
  uri,
  url,
  estilo,
  onAbrir,
}: {
  uri?: string;
  url?: string;
  estilo: StyleProp<ImageStyle>;
  onAbrir?: () => void;
}) {
  const { t } = useTranslation();
  const { fuenteActual, alCargar, alFallar } = useFuenteFoto(uri, url);

  if (!fuenteActual) {
    return (
      <View style={[estilo, estilos.fotoNoDisponible]}>
        <Ionicons name="image-outline" size={22} color={colores.textoSecundario} />
        <Text style={estilos.textoFotoNoDisponible}>{t("detalleJornada.fotoNoDisponible")}</Text>
      </View>
    );
  }

  const imagen = (
    <Image
      // key fuerza un remount limpio al cambiar de fuente -- un <Image> que quedó esperando un
      // archivo roto no debe arrastrar ningún estado interno a la URL de respaldo.
      key={fuenteActual}
      source={{ uri: fuenteActual }}
      style={estilo}
      onLoad={alCargar}
      onError={alFallar}
    />
  );

  if (!onAbrir) return imagen;
  return (
    // `estilo` también va acá: FotoEvidencia se usa como hijo directo de un contenedor flex-row
    // (las 2 fotos de check-in lado a lado, o la grilla de incidencias) y depende de `flex`/ancho
    // fijo propios -- si solo el <Image> de adentro los tiene, este Pressable (sin estilo) se
    // convierte en el verdadero hijo del row y colapsa a ancho ~0, dejando la foto invisible
    // aunque cargue bien (ver onLoad arriba: carga, pero no se ve).
    <Pressable accessibilityRole="button" onPress={onAbrir} style={estilo}>
      {imagen}
    </Pressable>
  );
}

/** Empareja por índice el arreglo de URIs locales con el de URLs remotas de un mismo grupo de
 * fotos (incidencia de check-in o de check-out) — son dos columnas paralelas, nunca garantizado
 * que tengan la misma longitud (una foto recuperada del servidor, Hallazgo #27/#46, puede no
 * tener URI local). */
function emparejarFotos(
  uris: string[] | undefined,
  urls: string[] | undefined
): { uri?: string; url?: string }[] {
  const cantidad = Math.max(uris?.length ?? 0, urls?.length ?? 0);
  return Array.from({ length: cantidad }, (_, i) => ({ uri: uris?.[i], url: urls?.[i] }));
}

export default function DetalleJornadaScreen() {
  const { params } = useRoute<DetalleJornadaRouteProp>();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { t } = useTranslation();
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [mostrarFormularioCheckOut, setMostrarFormularioCheckOut] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [visor, setVisor] = useState<{ fotos: FotoPar[]; indice: number } | null>(null);
  const { capturarUbicacion, obteniendo: obteniendoUbicacion } = useUbicacion();
  const { conectado, jornadasCorregidas } = useNetwork();
  const refScroll = useRef<ScrollView>(null);
  const refKmFinal = useRef<TextInput>(null);
  const ySeccionCheckOut = useRef(0);

  useEffect(() => {
    obtenerJornadaPorId(params.id).then(setJornada);
  }, [params.id]);

  // Hallazgo #28/#29: esta era la única pantalla que no escuchaba `jornadasCorregidas` —
  // `HistorialScreen` se suscribió en el #28, acá quedó pendiente. Es justo la pantalla donde el
  // chofer lee los datos antes de cerrar la jornada: si acá se ve el valor viejo, el aviso de la
  // corrección (que ya disparó `useJornadasAbiertas`) no sirve para nada — habría que salir y
  // volver a entrar para verlo. Recarga solo si la corrección tocó ESTA jornada.
  useEffect(() => {
    if (!jornadasCorregidas.some((j) => j.id === params.id)) return;
    obtenerJornadaPorId(params.id).then(setJornada);
  }, [jornadasCorregidas, params.id]);

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

  const fotosIncidenciaCheckin = emparejarFotos(
    jornada.fotosIncidenciaCheckinUris,
    jornada.fotosIncidenciaCheckin
  );
  const fotosIncidencia = emparejarFotos(jornada.fotosIncidenciaUris, jornada.fotosIncidencia);

  return (
    <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <BannerConexion />
      <ScrollView
        ref={refScroll}
        style={estilos.pantalla}
        contentContainerStyle={estilos.contenido}
        keyboardShouldPersistTaps="handled"
      >
        {/* spec_tarjeta_jornada_empresa.md (ampliación 2026-09-30): mismo criterio que
            TarjetaJornada.tsx (Hallazgo #37) — la empresa pasa a ser el dato principal, la
            matrícula baja a una línea secundaria. La fila "Empresa" de la sección de check-in más
            abajo no se toca (fuera de alcance de esta ampliación: solo la jerarquía título/
            secundaria). */}
        <Text style={estilos.titulo}>{textoEmpresa(jornada.empresa, t("detalleJornada.sinEmpresa"))}</Text>
        <Text style={estilos.chofer}>{jornada.choferNombre}</Text>
        <Text style={estilos.matriculaSecundaria}>{jornada.matricula}</Text>

        <View style={estilos.seccion}>
          <Text style={estilos.seccionTitulo}>{t("detalleJornada.seccionCheckIn")}</Text>
          <Fila
            etiqueta={t("detalleJornada.fechaHora")}
            valor={new Date(jornada.fechaCheckIn).toLocaleString("es-MX")}
          />
          <Fila etiqueta={t("detalleJornada.empresa")} valor={jornada.empresa} />
          <Fila etiqueta={t("detalleJornada.ruta")} valor={jornada.ruta} />
          <Fila etiqueta={t("detalleJornada.kmInicial")} valor={`${jornada.kmInicial} km`} />
          <Fila etiqueta={t("detalleJornada.combustible")} valor={`${jornada.combustibleInicial}%`} />
          <FilaUbicacion
            etiqueta={t("detalleJornada.ubicacion")}
            lat={jornada.latInicial}
            lng={jornada.lngInicial}
          />
          <View style={estilos.filaFotos}>
            {/* spec_rutas_asignadas_admin.md: una jornada creada_por_admin puede no tener foto
                real de tacómetro -- ya no es un campo garantizado, a diferencia de una jornada
                que nació del check-in del propio chofer. */}
            {jornada.fotoTacometroInicialUri || jornada.fotoCheckInUrl ? (
              <FotoEvidencia
                key={`${jornada.fotoTacometroInicialUri}|${jornada.fotoCheckInUrl}`}
                uri={jornada.fotoTacometroInicialUri}
                url={jornada.fotoCheckInUrl}
                estilo={estilos.foto}
                onAbrir={() =>
                  setVisor({
                    fotos: [{ uri: jornada.fotoTacometroInicialUri, url: jornada.fotoCheckInUrl }],
                    indice: 0,
                  })
                }
              />
            ) : null}
            {jornada.fotoRutaUri || jornada.fotoRutaUrl ? (
              <FotoEvidencia
                key={`${jornada.fotoRutaUri}|${jornada.fotoRutaUrl}`}
                uri={jornada.fotoRutaUri}
                url={jornada.fotoRutaUrl}
                estilo={estilos.foto}
                onAbrir={() =>
                  setVisor({ fotos: [{ uri: jornada.fotoRutaUri, url: jornada.fotoRutaUrl }], indice: 0 })
                }
              />
            ) : null}
          </View>
          {/* spec_incidencia_en_checkin.md: incidencia estructurada del check-in, mismo patrón que
              la del check-out más abajo. `jornada.incidencias` (texto libre) es el histórico de
              jornadas creadas antes de este spec — se muestra tal cual solo cuando no hay datos
              estructurados, para no perder ningún dato viejo. */}
          <FilaTexto
            etiqueta={t("detalleJornada.incidencia")}
            valor={
              jornada.tuvoIncidenciaCheckin
                ? `${jornada.tipoIncidenciaCheckin ? t(CLAVE_TIPO_INCIDENCIA[jornada.tipoIncidenciaCheckin]) : "-"}${jornada.detalleIncidenciaCheckin ? ` — ${jornada.detalleIncidenciaCheckin}` : ""}`
                : jornada.incidencias || t("detalleJornada.sinIncidencias")
            }
          />
          {fotosIncidenciaCheckin.length > 0 ? (
            <View style={estilos.filaFotosIncidencia}>
              {fotosIncidenciaCheckin.map((par, i) => (
                <FotoEvidencia
                  key={`${i}-${par.uri}|${par.url}`}
                  uri={par.uri}
                  url={par.url}
                  estilo={estilos.fotoIncidencia}
                  onAbrir={() => setVisor({ fotos: fotosIncidenciaCheckin, indice: i })}
                />
              ))}
            </View>
          ) : null}
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
            {jornada.fotoTacometroFinalUri || jornada.fotoCheckOutUrl ? (
              <FotoEvidencia
                key={`${jornada.fotoTacometroFinalUri}|${jornada.fotoCheckOutUrl}`}
                uri={jornada.fotoTacometroFinalUri}
                url={jornada.fotoCheckOutUrl}
                estilo={estilos.foto}
                onAbrir={() =>
                  setVisor({
                    fotos: [{ uri: jornada.fotoTacometroFinalUri, url: jornada.fotoCheckOutUrl }],
                    indice: 0,
                  })
                }
              />
            ) : null}
            <FilaTexto
              etiqueta={t("detalleJornada.incidencia")}
              valor={
                jornada.tuvoIncidencia
                  ? `${jornada.tipoIncidencia ? t(CLAVE_TIPO_INCIDENCIA[jornada.tipoIncidencia]) : "-"}${jornada.detalleIncidencia ? ` — ${jornada.detalleIncidencia}` : ""}`
                  : t("detalleJornada.sinIncidencias")
              }
            />
            {fotosIncidencia.length > 0 ? (
              <View style={estilos.filaFotosIncidencia}>
                {fotosIncidencia.map((par, i) => (
                  <FotoEvidencia
                    key={`${i}-${par.uri}|${par.url}`}
                    uri={par.uri}
                    url={par.url}
                    estilo={estilos.fotoIncidencia}
                    onAbrir={() => setVisor({ fotos: fotosIncidencia, indice: i })}
                  />
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
                scrollViewRef={refScroll}
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
          {jornada.sincronizacion === "error" && jornada.intentosSincronizacion >= MAX_INTENTOS
            ? t("detalleJornada.sincNecesitaReintento")
            : `${t("detalleJornada.estadoEnvio")} ${
                {
                  pendiente: t("detalleJornada.sincPendiente"),
                  sincronizando: t("detalleJornada.sincEnviando"),
                  sincronizado: t("detalleJornada.sincEnviado"),
                  error: t("detalleJornada.sincError"),
                }[jornada.sincronizacion]
              }`}
        </Text>
      </ScrollView>
      <VisorFotoAmpliada
        visible={visor != null}
        fotos={visor?.fotos ?? []}
        indiceInicial={visor?.indice ?? 0}
        onCerrar={() => setVisor(null)}
      />
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
    // El campo "Detalle de incidencia" del check-out crece hacia el final
    // del formulario — mismo motivo que NuevoCheckInScreen.tsx, ver
    // ESPACIO_EXTRA_TECLADO.
    paddingBottom: ESPACIO_EXTRA_TECLADO,
  },
  titulo: {
    ...tipografia.titulo,
  },
  chofer: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
  },
  matriculaSecundaria: {
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
  // Hallazgo #46: mismo radio/fondo que un <Image> real (foto o fotoIncidencia, según cuál de
  // los dos estilos reciba via la prop `estilo` de FotoEvidencia) -- el placeholder ocupa
  // exactamente el mismo lugar que hubiera ocupado la foto, nunca colapsa el layout.
  fotoNoDisponible: {
    alignItems: "center",
    justifyContent: "center",
    gap: espaciado.xs,
    backgroundColor: colores.fondo,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  textoFotoNoDisponible: {
    ...tipografia.ayuda,
    textAlign: "center",
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
