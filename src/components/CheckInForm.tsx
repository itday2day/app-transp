import React, { useEffect, useRef, useState, type RefObject } from "react";
import { View, StyleSheet, TextInput, ScrollView, Alert } from "react-native";
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
import { VentanaAgregarCatalogo } from "@/components/VentanaAgregarCatalogo";
import {
  obtenerCatalogoEmpresas,
  obtenerCatalogoRutasPorEmpresa,
  agregarCatalogoLocalPendiente,
} from "@/db/catalogoRepo";
import { listaConDefecto } from "@/utils/catalogoConDefecto";
import { aplicarDefectosCheckIn } from "@/utils/aplicarDefectosCheckIn";
import { IncidenciaData, NivelCombustible, TipoIncidenciaCheckin } from "@/types";
import { scrollAlCampo } from "@/utils/scrollAlCampo";
import { colores } from "@/theme/colors";
import { espaciado } from "@/theme/spacing";

export interface ValoresCheckInForm {
  empresa: string;
  matricula: string;
  ruta: string;
  kmInicial: number;
  // spec_ajustes_previos_apk.md, A6: opcional -- si el chofer no elige nada, se guarda null
  // (nunca 0, que SÍ es un valor real y válido, elegido a propósito).
  combustibleInicial: NivelCombustible | null;
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
  /** spec_app_registro_paso5.md, paso 2c-4: Usuario.empresaDefecto/rutaDefecto -- vienen de
   * SecureStore, disponibles incluso sin red (A11). Pueden llegar DESPUÉS de montar (la recarga en
   * segundo plano de programarRecargaUsuario() puede corregir un usuarioMinimo ya en pantalla) --
   * por eso son props reactivas, no solo un valor inicial. */
  empresaDefecto?: string | null;
  rutaDefecto?: string | null;
}

const INCIDENCIA_INICIAL: IncidenciaData = {
  tuvoIncidencia: false,
  tipo: null,
  detalle: "",
  fotos: [],
};

export function CheckInForm({
  onEnviar,
  enviando,
  matriculasFrecuentes,
  scrollViewRef,
  empresaDefecto = null,
  rutaDefecto = null,
}: Props) {
  const { t } = useTranslation();
  // spec_catalogo_por_chofer.md (criterio 16): ya no hay catálogo bundle (EMPRESAS/
  // RUTAS_POR_EMPRESA no existen más) -- en el primer render, antes de que responda SQLite, los
  // dos catálogos están vacíos de verdad. aplicarDefectosCheckIn/listaConDefecto ya resuelven ese
  // caso (criterio 21): un empresaDefecto/rutaDefecto que no esté en ningún catálogo todavía se
  // antepone igual más abajo (empresasConDefecto/rutasPorEmpresaConDefecto), así que el selector
  // nunca queda vacío si el chofer ya tiene un valor por defecto -- solo lo está si de verdad no
  // tiene ninguno Y el catálogo todavía no bajó.
  const defectosIniciales = aplicarDefectosCheckIn({
    empresa: null,
    ruta: "",
    tocada: false,
    empresaDefecto,
    rutaDefecto,
    empresasDisponibles: [],
    rutasPorEmpresa: {},
  });
  const [empresa, setEmpresa] = useState<string | null>(defectosIniciales.empresa);
  const [matricula, setMatricula] = useState("");
  const [ruta, setRuta] = useState(defectosIniciales.ruta);
  // true en cuanto el chofer toca empresa o ruta a mano -- a partir de ahí, un empresaDefecto/
  // rutaDefecto que llegue tarde (R6: la recarga en segundo plano puede corregirlos después de
  // montar) ya NO se aplica, para no pisar una elección que el chofer ya hizo. Arranca en false
  // SIEMPRE (incluso si ya había un defecto al montar) -- lo que importa es si el chofer tocó el
  // campo, no si ya traía un valor.
  const [empresaORutaTocada, setEmpresaORutaTocada] = useState(false);
  // spec_catalogo_por_chofer.md (criterio 18): qué ventana "Agregar..." está abierta -- `null`
  // cerrada, o el tipo ("empresa"/"ruta") que corresponde al selector que la disparó. Reemplaza al
  // viejo "modo ruta manual" (rutaManual/CampoTexto/elegirDeLaLista en este archivo).
  const [agregandoCatalogo, setAgregandoCatalogo] = useState<"empresa" | "ruta" | null>(null);
  const [kmInicial, setKmInicial] = useState("");
  const [combustible, setCombustible] = useState<NivelCombustible | null>(null);
  const [fotoTacometro, setFotoTacometro] = useState<string | null>(null);
  const [fotoRuta, setFotoRuta] = useState<string | null>(null);
  const [incidencia, setIncidencia] = useState<IncidenciaData>(INCIDENCIA_INICIAL);

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

  // spec_catalogo_por_chofer.md (criterio 16): ya no hay lista incluida en la app -- arranca
  // vacío (nunca EMPRESAS/RUTAS_POR_EMPRESA, que no existen más) hasta que responda la primera
  // consulta a SQLite, abajo. obtenerCatalogoEmpresas/obtenerCatalogoRutasPorEmpresa ya devuelven
  // la UNIÓN de lo descargado de Supabase con lo que el propio chofer agregó localmente
  // (catalogoLocalPendiente, ver catalogoRepo.ts) -- un catálogo vacío de verdad (primer arranque,
  // sin red, nada agregado todavía) es una lista vacía real, con solo la opción "Agregar..."
  // (criterio 16: sin respaldo de bundle).
  const [empresasDisponibles, setEmpresasDisponibles] = useState<string[]>([]);
  const [rutasPorEmpresa, setRutasPorEmpresa] = useState<Record<string, string[]>>({});
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
      setEmpresasDisponibles(empresasCache);
      setRutasPorEmpresa(rutasCache);
    })();
    return () => {
      activo = false;
    };
  }, []);

  // 2c-4: empresasDisponibles/rutasPorEmpresa vienen del catálogo (bundle o SQLite) -- si
  // empresaDefecto/rutaDefecto no están ahí (ej. el chofer tiene una invitación "abierta" con una
  // empresa que todavía no está en ningún catálogo descargado), listaConDefecto() los antepone
  // para que sean una opción GENUINA del desplegable, no solo texto preseleccionado. Funciona sin
  // red: empresaDefecto/rutaDefecto vienen de SecureStore (Usuario), no de ningún catálogo.
  const empresasConDefecto = listaConDefecto(empresasDisponibles, empresaDefecto);
  const rutasPorEmpresaConDefecto =
    empresaDefecto && rutaDefecto
      ? {
          ...rutasPorEmpresa,
          [empresaDefecto]: listaConDefecto(rutasPorEmpresa[empresaDefecto] ?? [], rutaDefecto),
        }
      : rutasPorEmpresa;
  const rutasDisponibles = empresa ? (rutasPorEmpresaConDefecto[empresa] ?? []) : [];

  // R6 (bug real corregido en esta ronda): empresaDefecto/rutaDefecto pueden llegar DESPUÉS de
  // montar (la recarga en segundo plano de programarRecargaUsuario() puede corregir un
  // usuarioMinimo que entró con los dos en null) -- solo se aplican si el chofer todavía no tocó
  // ninguno de los dos campos. ANTES esto vivía en DOS bloques separados, cada uno con su propio
  // "procesado": si empresaDefecto Y rutaDefecto llegaban juntos en el MISMO render, el bloque de
  // ruta leía la variable `empresa` TODAVÍA vieja (el setEmpresa() del bloque de arriba no muta la
  // variable ya leída en este mismo render) y la ruta por defecto se perdía para siempre -- ver
  // aplicarDefectosCheckIn.ts, que resuelve los dos EN ORDEN dentro de una sola función pura, ya
  // probada aparte. Un solo "procesado" (la pareja completa) y un solo ajuste de estado durante el
  // RENDER (no en un efecto, mismo motivo que antes: react-hooks/set-state-in-effect).
  const [defectosProcesados, setDefectosProcesados] = useState<{
    empresa: string | null;
    ruta: string | null;
  }>({ empresa: null, ruta: null });
  if (defectosProcesados.empresa !== empresaDefecto || defectosProcesados.ruta !== rutaDefecto) {
    setDefectosProcesados({ empresa: empresaDefecto, ruta: rutaDefecto });
    const resuelto = aplicarDefectosCheckIn({
      empresa,
      ruta,
      tocada: empresaORutaTocada,
      empresaDefecto,
      rutaDefecto,
      empresasDisponibles,
      rutasPorEmpresa,
    });
    if (resuelto.empresa !== empresa) setEmpresa(resuelto.empresa);
    if (resuelto.ruta !== ruta) setRuta(resuelto.ruta);
  }

  // El prop `enviando` solo baja a `false` cuando el envío (éxito o error) terminó en la pantalla
  // contenedora -- recién ahí vuelve a estar permitido un envío nuevo.
  useEffect(() => {
    if (!enviando) yaEnviando.current = false;
  }, [enviando]);

  function manejarCambioEmpresa(nuevaEmpresa: string) {
    setEmpresaORutaTocada(true);
    setEmpresa(nuevaEmpresa);
    // Las rutas dependen de la empresa, así que una ruta ya elegida deja de
    // tener sentido en cuanto cambia la empresa.
    setRuta("");
  }

  function manejarCambioRuta(nuevaRuta: string) {
    setEmpresaORutaTocada(true);
    setRuta(nuevaRuta);
  }

  // spec_catalogo_por_chofer.md (criterio 18): callback único de VentanaAgregarCatalogo para
  // empresa Y ruta -- `agregandoCatalogo` (capturado en una variable local porque el cierre del
  // modal, abajo, ya lo puso en null antes de que esto termine) dice cuál de los dos está en
  // juego. `esNuevo=false` (duplicado, comparación sin acentos de la propia ventana): solo
  // selecciona la grafía YA existente y avisa, sin tocar la base -- "una ruta nueva de una empresa
  // que TAMBIÉN es nueva" (si algún día hiciera falta un alta compuesta) no aplica aquí porque la
  // empresa SIEMPRE se elige/agrega ANTES de poder abrir la ventana de ruta (deshabilitada sin
  // empresa, ver opcionEspecial de abajo) -- la fila de ruta en catalogoLocalPendiente ya queda
  // con el nombre de esa empresa, nueva o no, sin ningún caso especial.
  async function manejarConfirmarAgregarCatalogo(nombre: string, esNuevo: boolean) {
    const tipo = agregandoCatalogo;
    setAgregandoCatalogo(null);
    if (!tipo) return;

    if (!esNuevo) {
      Alert.alert(t("agregarCatalogo.yaEnLista"));
      if (tipo === "empresa") manejarCambioEmpresa(nombre);
      else manejarCambioRuta(nombre);
      return;
    }

    // Corrección 1 (2026-10-26): si agregarCatalogoLocalPendiente falla (SQLite), NO dejar la UI a
    // medias (no tocar empresasDisponibles/rutasPorEmpresa ni preseleccionar nada) ni dejar pasar
    // una excepción sin atrapar -- manejarConfirmarAgregarCatalogo es async y VentanaAgregarCatalogo
    // la llama como onConfirmar sin esperarla ni atraparla, así que un throw acá se perdería como
    // una unhandled promise rejection.
    if (tipo === "empresa") {
      try {
        await agregarCatalogoLocalPendiente("empresa", "", nombre);
      } catch {
        Alert.alert(t("agregarCatalogo.errorAlAgregar"));
        return;
      }
      setEmpresasDisponibles((prev) => [...prev, nombre]);
      manejarCambioEmpresa(nombre);
    } else {
      if (!empresa) return; // nunca debería pasar: opcionEspecial de ruta va deshabilitada sin empresa
      try {
        await agregarCatalogoLocalPendiente("ruta", empresa, nombre);
      } catch {
        Alert.alert(t("agregarCatalogo.errorAlAgregar"));
        return;
      }
      setRutasPorEmpresa((prev) => ({ ...prev, [empresa]: [...(prev[empresa] ?? []), nombre] }));
      manejarCambioRuta(nombre);
    }
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

    if (!empresa || !fotoTacometro) return; // nunca debería pasar: ya validado arriba

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
            opciones={empresasConDefecto}
            obtenerEtiqueta={(item) => item}
            onSeleccionar={manejarCambioEmpresa}
            opcionEspecial={{
              texto: t("checkInForm.agregarEmpresa"),
              onPress: () => setAgregandoCatalogo("empresa"),
            }}
            error={mostrarErrores && empresa === null ? t("comun.campoObligatorio") : undefined}
          />
        </View>

        <View ref={refContRuta}>
          <SelectorDesplegable
            etiqueta={t("checkInForm.rutaEtiqueta")}
            placeholder={t("checkInForm.rutaPlaceholderLista")}
            textoDeshabilitado={t("checkInForm.rutaDeshabilitada")}
            valor={ruta || null}
            opciones={rutasDisponibles}
            deshabilitado={empresa === null}
            onSeleccionar={manejarCambioRuta}
            opcionEspecial={{
              texto: t("checkInForm.agregarRuta"),
              onPress: () => setAgregandoCatalogo("ruta"),
            }}
            error={mostrarErrores && ruta.trim().length === 0 ? t("comun.campoObligatorio") : undefined}
          />
        </View>
      </View>

      <VentanaAgregarCatalogo
        visible={agregandoCatalogo !== null}
        tipo={agregandoCatalogo ?? "empresa"}
        opcionesVisibles={agregandoCatalogo === "ruta" ? rutasDisponibles : empresasConDefecto}
        onCerrar={() => setAgregandoCatalogo(null)}
        onConfirmar={manejarConfirmarAgregarCatalogo}
      />

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
          {/* spec_ajustes_previos_apk.md, A6: opcional -- mismo sufijo que incidencias.detalleOpcional
              (reutilizado, no una clave nueva casi idéntica) y permitirLimpiar, para poder volver a
              "sin elegir" tras tocar un chip por error. */}
          <SelectorCombustible
            etiqueta={`${t("checkInForm.combustibleEtiqueta")}${t("incidencias.detalleOpcional")}`}
            valor={combustible}
            onCambiar={setCombustible}
            permitirLimpiar
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
            icono="speedometer-outline"
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
});
