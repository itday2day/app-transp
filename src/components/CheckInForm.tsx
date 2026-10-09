import React, { useEffect, useRef, useState, type RefObject } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Keyboard,
  ScrollView,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { SelectorDesplegable } from "@/components/SelectorDesplegable";
import { SelectorMatricula } from "@/components/SelectorMatricula";
import { SelectorCombustible } from "@/components/SelectorCombustible";
import { CapturaFoto } from "@/components/CapturaFoto";
import {
  IncidenciasForm,
  TIPOS_INCIDENCIA_CHECKIN,
  CLAVE_TIPO_INCIDENCIA_CHECKIN,
} from "@/components/IncidenciasForm";
import { BotonPrimario } from "@/components/BotonPrimario";
import { EMPRESAS, RUTAS_POR_EMPRESA } from "@/data/empresas";
import { obtenerCatalogoEmpresas, obtenerCatalogoRutasPorEmpresa } from "@/db/catalogoRepo";
import { IncidenciaData, NivelCombustible, TipoIncidenciaCheckin } from "@/types";
import { scrollAlCampo } from "@/utils/scrollAlCampo";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

export interface ValoresCheckInForm {
  empresa: string;
  matricula: string;
  ruta: string;
  kmInicial: number;
  combustibleInicial: NivelCombustible;
  fotoTacometroInicialUri: string;
  fotoRutaUri?: string;
  tuvoIncidenciaCheckin: boolean;
  tipoIncidenciaCheckin: TipoIncidenciaCheckin | null;
  detalleIncidenciaCheckin: string;
  fotosIncidenciaCheckinUris: string[];
}

interface Props {
  onEnviar: (valores: ValoresCheckInForm) => void;
  enviando: boolean;
  matriculasFrecuentes: string[];
  /** ScrollView de CheckInScreen — se reenvía a IncidenciasForm para traer su
   * campo de detalle a la vista cuando se enfoca (spec_incidencia_en_checkin.md,
   * mismo patrón que ya usa CheckOutForm). */
  scrollViewRef: RefObject<ScrollView | null>;
}

const INCIDENCIA_INICIAL: IncidenciaData = {
  tuvoIncidencia: false,
  tipo: null,
  detalle: "",
  fotos: [],
};

export function CheckInForm({ onEnviar, enviando, matriculasFrecuentes, scrollViewRef }: Props) {
  const { t } = useTranslation();
  const [empresa, setEmpresa] = useState<string | null>(null);
  const [matricula, setMatricula] = useState("");
  const [ruta, setRuta] = useState("");
  const [rutaManual, setRutaManual] = useState(false);
  const [kmInicial, setKmInicial] = useState("");
  const [combustible, setCombustible] = useState<NivelCombustible | null>(null);
  const [fotoTacometro, setFotoTacometro] = useState<string | null>(null);
  const [fotoRuta, setFotoRuta] = useState<string | null>(null);
  const [incidencia, setIncidencia] = useState<IncidenciaData>(INCIDENCIA_INICIAL);
  const refRutaManual = useRef<TextInput>(null);

  // spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50): un objetivo de scroll/foco por
  // campo obligatorio, en el mismo orden en que aparecen en pantalla -- usado solo al tocar
  // "Registrar check-in" con algo pendiente (criterio 8). La foto de la hoja de ruta no entra:
  // sigue siendo opcional, como hoy.
  const refContEmpresa = useRef<View>(null);
  const refContRuta = useRef<View>(null);
  const refContMatricula = useRef<View>(null);
  const refMatriculaInput = useRef<TextInput>(null);
  const refKmInicial = useRef<TextInput>(null);
  const refContCombustible = useRef<View>(null);
  const refContFotoTacometro = useRef<View>(null);
  const refDetalleIncidencia = useRef<TextInput>(null);
  // Mismo criterio que NuevoCheckInScreen/CheckOutForm (ver manejarEnviar más abajo): un ref
  // síncrono, no el prop `enviando` (que depende de un re-render), es lo único que de verdad
  // protege contra un segundo toque disparado antes de que React vuelva a pintar el botón
  // deshabilitado.
  const yaEnviando = useRef(false);

  // spec_catalogo_empresas_rutas.md (Hallazgo #48): arranca con la lista incluida en la app
  // (EMPRESAS/RUTAS_POR_EMPRESA) -- nunca un selector vacío, ni en el primer uso sin red ni
  // mientras se resuelve esta consulta a SQLite -- y la reemplaza con la caché del catálogo de
  // Supabase en cuanto está disponible (criterio 10: sin conexión usa la caché ya descargada; sin
  // caché todavía, esta lista incluida es el único respaldo que queda).
  const [empresasDisponibles, setEmpresasDisponibles] = useState<string[]>(EMPRESAS);
  const [rutasPorEmpresa, setRutasPorEmpresa] = useState<Record<string, string[]>>(RUTAS_POR_EMPRESA);
  // Solo true después de un intento de envío con algo pendiente -- antes de eso, estos campos
  // nunca mostraron un error reactivo (a diferencia del detalle de incidencia "Otro", que ya tenía
  // su propio aviso en vivo desde antes de este hallazgo y sigue igual).
  const [mostrarErrores, setMostrarErrores] = useState(false);

  useEffect(() => {
    let activo = true;
    (async () => {
      const [empresasCache, rutasCache] = await Promise.all([
        obtenerCatalogoEmpresas(),
        obtenerCatalogoRutasPorEmpresa(),
      ]);
      if (!activo) return;
      if (empresasCache.length > 0) setEmpresasDisponibles(empresasCache);
      if (Object.keys(rutasCache).length > 0) setRutasPorEmpresa(rutasCache);
    })();
    return () => {
      activo = false;
    };
  }, []);

  const rutasDisponibles = empresa ? (rutasPorEmpresa[empresa] ?? []) : [];

  useEffect(() => {
    if (!rutaManual) return;
    // El input se activa justo cuando se cierra el modal de "Ruta" (Selector-
    // Desplegable); si se enfoca de inmediato, la animación de cierre del
    // modal le roba el foco y el teclado se abre y se cierra al toque. Se
    // espera a que esa animación termine antes de enfocar.
    const temporizador = setTimeout(() => refRutaManual.current?.focus(), 350);
    return () => clearTimeout(temporizador);
  }, [rutaManual]);

  // El prop `enviando` solo baja a `false` cuando el envío (éxito o error) terminó en la pantalla
  // contenedora -- recién ahí vuelve a estar permitido un envío nuevo.
  useEffect(() => {
    if (!enviando) yaEnviando.current = false;
  }, [enviando]);

  function manejarCambioEmpresa(nuevaEmpresa: string) {
    setEmpresa(nuevaEmpresa);
    // Las rutas dependen de la empresa, así que una ruta ya elegida deja de
    // tener sentido en cuanto cambia la empresa.
    setRuta("");
    setRutaManual(false);
  }

  const detalleIncidenciaValido = incidencia.tipo !== "Otro" || incidencia.detalle.trim().length > 0;

  function manejarEnviar() {
    if (yaEnviando.current) return;

    // Orden de pantalla: empresa, ruta, matrícula, km inicial, combustible, foto del tablero,
    // detalle de incidencia (solo si corresponde). La foto de la hoja de ruta queda afuera a
    // propósito: sigue siendo opcional.
    const campos = [
      { falta: empresa === null, etiqueta: t("checkInForm.empresaEtiqueta"), contRef: refContEmpresa },
      { falta: ruta.trim().length === 0, etiqueta: t("checkInForm.rutaEtiqueta"), contRef: refContRuta },
      {
        falta: matricula.trim().length === 0,
        etiqueta: t("selectorMatricula.etiqueta"),
        contRef: refContMatricula,
        focoRef: refMatriculaInput,
      },
      {
        falta: !(Number(kmInicial) > 0),
        etiqueta: t("checkInForm.kmInicialEtiqueta"),
        contRef: refKmInicial,
        focoRef: refKmInicial,
      },
      {
        falta: combustible === null,
        etiqueta: t("checkInForm.combustibleEtiqueta"),
        contRef: refContCombustible,
      },
      {
        falta: fotoTacometro === null,
        etiqueta: t("checkInForm.fotoTablero"),
        contRef: refContFotoTacometro,
      },
      {
        falta: !detalleIncidenciaValido,
        etiqueta: t("incidencias.detalleEtiqueta"),
        contRef: refDetalleIncidencia,
        focoRef: refDetalleIncidencia,
      },
    ];

    const faltantes = campos.filter((c) => c.falta);
    if (faltantes.length > 0) {
      setMostrarErrores(true);
      scrollAlCampo(scrollViewRef, faltantes[0].contRef, faltantes[0].focoRef);
      Alert.alert(t("avisoCampos.titulo"), faltantes.map((c) => `• ${c.etiqueta}`).join("\n"));
      return;
    }

    if (!empresa || !combustible || !fotoTacometro) return; // nunca debería pasar: ya validado arriba

    yaEnviando.current = true;
    onEnviar({
      empresa,
      // spec_normalizacion_dni_matricula_telefono.md: red de seguridad además de la que ya aplica
      // SelectorMatricula en la entrada manual — cubre el camino de "elegir de la lista" de
      // matrículas frecuentes, que no pasa por esa normalización.
      matricula: matricula.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      // spec_catalogo_empresas_rutas.md (Hallazgo #48): TODA la información de ruta se guarda en
      // mayúsculas, igual que empresa -- mismo criterio que matricula arriba (red de seguridad
      // además de lo que ya hace el teclado con autoCapitalize="characters" más abajo). Una ruta
      // elegida de la lista ya viene en mayúsculas del catálogo; esto cubre la entrada manual.
      ruta: ruta.trim().toLocaleUpperCase("es"),
      kmInicial: Number(kmInicial),
      combustibleInicial: combustible,
      fotoTacometroInicialUri: fotoTacometro,
      fotoRutaUri: fotoRuta ?? undefined,
      tuvoIncidenciaCheckin: incidencia.tuvoIncidencia,
      tipoIncidenciaCheckin: incidencia.tuvoIncidencia ? incidencia.tipo : null,
      detalleIncidenciaCheckin: incidencia.tuvoIncidencia ? incidencia.detalle.trim() : "",
      fotosIncidenciaCheckinUris: incidencia.tuvoIncidencia ? incidencia.fotos : [],
    });
  }

  return (
    <View>
      {/* Sección 1: datos de operación — empresa y ruta dependen una de la otra. */}
      <View>
        <View ref={refContEmpresa}>
          <SelectorBuscable
            etiqueta={t("checkInForm.empresaEtiqueta")}
            placeholder={t("checkInForm.empresaPlaceholder")}
            valor={empresa}
            opciones={empresasDisponibles}
            obtenerEtiqueta={(item) => item}
            onSeleccionar={manejarCambioEmpresa}
            error={mostrarErrores && empresa === null ? t("comun.campoObligatorio") : undefined}
          />
        </View>

        <View ref={refContRuta}>
          {rutaManual ? (
            <View>
              <CampoTexto
                ref={refRutaManual}
                etiqueta={t("checkInForm.rutaEtiqueta")}
                placeholder={t("checkInForm.rutaPlaceholderManual")}
                value={ruta}
                onChangeText={setRuta}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                error={mostrarErrores && ruta.trim().length === 0 ? t("comun.campoObligatorio") : undefined}
              />
              {rutasDisponibles.length > 0 ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => {
                    setRutaManual(false);
                    setRuta("");
                  }}
                  style={estilos.enlaceContenedor}
                >
                  <Text style={estilos.enlace}>{t("checkInForm.elegirDeLaLista")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <SelectorDesplegable
              etiqueta={t("checkInForm.rutaEtiqueta")}
              placeholder={t("checkInForm.rutaPlaceholderLista")}
              textoDeshabilitado={t("checkInForm.rutaDeshabilitada")}
              valor={ruta || null}
              opciones={rutasDisponibles}
              deshabilitado={empresa === null}
              onSeleccionar={setRuta}
              opcionEspecial={{
                texto: t("checkInForm.agregarRutaManual"),
                onPress: () => setRutaManual(true),
              }}
              error={mostrarErrores && ruta.trim().length === 0 ? t("comun.campoObligatorio") : undefined}
            />
          )}
        </View>
      </View>

      <View style={estilos.divisor} />

      {/* Sección 2: control del vehículo. */}
      <View>
        <View ref={refContMatricula}>
          <SelectorMatricula
            ref={refMatriculaInput}
            valor={matricula}
            onCambiar={setMatricula}
            opciones={matriculasFrecuentes}
            error={mostrarErrores && matricula.trim().length === 0 ? t("comun.campoObligatorio") : undefined}
          />
        </View>

        <CampoTexto
          ref={refKmInicial}
          etiqueta={t("checkInForm.kmInicialEtiqueta")}
          placeholder={t("checkInForm.kmInicialPlaceholder")}
          keyboardType="numeric"
          value={kmInicial}
          onChangeText={setKmInicial}
          error={mostrarErrores && !(Number(kmInicial) > 0) ? t("comun.campoObligatorio") : undefined}
        />

        <View ref={refContCombustible}>
          <SelectorCombustible
            etiqueta={t("checkInForm.combustibleEtiqueta")}
            valor={combustible}
            onCambiar={setCombustible}
            error={mostrarErrores && combustible === null ? t("comun.campoObligatorio") : undefined}
          />
        </View>
      </View>

      <View style={estilos.divisor} />

      {/* Sección 3: evidencia visual. */}
      <View>
        <View ref={refContFotoTacometro}>
          <CapturaFoto
            etiqueta={t("checkInForm.fotoTablero")}
            ayuda={t("checkInForm.fotoTableroAyuda")}
            uri={fotoTacometro}
            onCapturada={setFotoTacometro}
            error={mostrarErrores && fotoTacometro === null ? t("comun.campoObligatorio") : undefined}
          />
        </View>

        <CapturaFoto
          etiqueta={t("checkInForm.fotoHojaRuta")}
          ayuda={t("checkInForm.fotoHojaRutaAyuda")}
          uri={fotoRuta}
          onCapturada={setFotoRuta}
        />
      </View>

      <View style={estilos.divisor} />

      {/* Sección 4: incidencia y envío. */}
      <View>
        <IncidenciasForm
          ref={refDetalleIncidencia}
          pregunta="incidencias.preguntaCheckin"
          tipos={TIPOS_INCIDENCIA_CHECKIN}
          etiquetasTipo={CLAVE_TIPO_INCIDENCIA_CHECKIN}
          valor={incidencia}
          onCambiar={setIncidencia}
        />

        <BotonPrimario
          titulo={t("checkInForm.botonEnviar")}
          onPress={manejarEnviar}
          cargando={enviando}
          deshabilitado={enviando}
          estilo={estilos.boton}
        />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  divisor: {
    height: 1,
    backgroundColor: colores.borde,
    marginTop: espaciado.sm,
    marginBottom: espaciado.lg,
  },
  boton: {
    marginTop: espaciado.sm,
  },
  enlaceContenedor: {
    marginTop: -espaciado.sm,
    marginBottom: espaciado.md,
  },
  enlace: {
    ...tipografia.cuerpo,
    color: colores.primario,
    fontWeight: "600",
  },
});
