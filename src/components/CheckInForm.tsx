import React, { useEffect, useRef, useState, type RefObject } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Keyboard,
  ScrollView,
  findNodeHandle,
  UIManager,
} from "react-native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { SelectorDesplegable } from "@/components/SelectorDesplegable";
import { SelectorMatricula } from "@/components/SelectorMatricula";
import { SelectorCombustible } from "@/components/SelectorCombustible";
import { CapturaFoto } from "@/components/CapturaFoto";
import { BotonPrimario } from "@/components/BotonPrimario";
import { EMPRESAS, obtenerRutasDeEmpresa } from "@/data/empresas";
import { NivelCombustible } from "@/types";
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
  incidencias: string;
}

interface Props {
  onEnviar: (valores: ValoresCheckInForm) => void;
  enviando: boolean;
  matriculasFrecuentes: string[];
  /** ScrollView de CheckInScreen — se usa para traer el campo de Incidencias
   * a la vista cuando se enfoca (ver manejarFocusIncidencias más abajo). */
  scrollViewRef: RefObject<ScrollView | null>;
}

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
  const [incidencias, setIncidencias] = useState("");
  const refRutaManual = useRef<TextInput>(null);
  const refIncidencias = useRef<TextInput>(null);

  // Mide la posición real del campo de Incidencias respecto al ScrollView
  // (no respecto a su padre inmediato — measureLayout resuelve eso sin tener
  // que acumular offsets a mano por cada nivel de anidamiento) y lo trae a la
  // vista al enfocarlo, para que el teclado nunca lo tape. Es multilínea y es
  // el campo más propenso a quedar oculto: el último del formulario.
  function manejarFocusIncidencias() {
    const scroll = scrollViewRef.current;
    if (!scroll) return;
    // ref.measureLayout() (el método de instancia, oficialmente el
    // "recomendado") tira "Warning: ref.measureLayout must be called with a
    // ref to a native component" con el ref de CampoTexto (envuelto con
    // forwardRef) — no lo reconoce como componente nativo pese a que
    // reenvía el ref directo al TextInput real. UIManager.measureLayout(),
    // la función de más bajo nivel, no llama al método sobre la instancia
    // del ref: solo necesita los tags numéricos de ambos nodos (vía
    // findNodeHandle), así que no depende de que el ref "sea" reconocido
    // como nativo — evita el problema por completo.
    const nodoCampo = findNodeHandle(refIncidencias.current);
    const nodoScroll = findNodeHandle(scroll);
    if (nodoCampo == null || nodoScroll == null) return;

    UIManager.measureLayout(
      nodoCampo,
      nodoScroll,
      () => {},
      (_left, top) => {
        scroll.scrollTo({ y: Math.max(0, top - espaciado.md), animated: true });
      }
    );
  }

  const rutasDisponibles = obtenerRutasDeEmpresa(empresa);

  useEffect(() => {
    if (!rutaManual) return;
    // El input se activa justo cuando se cierra el modal de "Ruta" (Selector-
    // Desplegable); si se enfoca de inmediato, la animación de cierre del
    // modal le roba el foco y el teclado se abre y se cierra al toque. Se
    // espera a que esa animación termine antes de enfocar.
    const temporizador = setTimeout(() => refRutaManual.current?.focus(), 350);
    return () => clearTimeout(temporizador);
  }, [rutaManual]);

  function manejarCambioEmpresa(nuevaEmpresa: string) {
    setEmpresa(nuevaEmpresa);
    // Las rutas dependen de la empresa, así que una ruta ya elegida deja de
    // tener sentido en cuanto cambia la empresa.
    setRuta("");
    setRutaManual(false);
  }

  const formularioValido =
    empresa !== null &&
    matricula.trim().length > 0 &&
    ruta.trim().length > 0 &&
    Number(kmInicial) > 0 &&
    combustible !== null &&
    fotoTacometro !== null;

  function manejarEnviar() {
    if (!formularioValido || !empresa || !combustible || !fotoTacometro) return;

    onEnviar({
      empresa,
      matricula: matricula.trim().toUpperCase(),
      ruta: ruta.trim(),
      kmInicial: Number(kmInicial),
      combustibleInicial: combustible,
      fotoTacometroInicialUri: fotoTacometro,
      fotoRutaUri: fotoRuta ?? undefined,
      incidencias: incidencias.trim(),
    });
  }

  return (
    <View>
      {/* Sección 1: datos de operación — empresa y ruta dependen una de la otra. */}
      <View>
        <SelectorDesplegable
          etiqueta={t("checkInForm.empresaEtiqueta")}
          placeholder={t("checkInForm.empresaPlaceholder")}
          valor={empresa}
          opciones={EMPRESAS}
          onSeleccionar={manejarCambioEmpresa}
        />

        {rutaManual ? (
          <View>
            <CampoTexto
              ref={refRutaManual}
              etiqueta={t("checkInForm.rutaEtiqueta")}
              placeholder={t("checkInForm.rutaPlaceholderManual")}
              value={ruta}
              onChangeText={setRuta}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
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
          />
        )}
      </View>

      <View style={estilos.divisor} />

      {/* Sección 2: control del vehículo. */}
      <View>
        <SelectorMatricula valor={matricula} onCambiar={setMatricula} opciones={matriculasFrecuentes} />

        <CampoTexto
          etiqueta={t("checkInForm.kmInicialEtiqueta")}
          placeholder={t("checkInForm.kmInicialPlaceholder")}
          keyboardType="numeric"
          value={kmInicial}
          onChangeText={setKmInicial}
        />

        <SelectorCombustible
          etiqueta={t("checkInForm.combustibleEtiqueta")}
          valor={combustible}
          onCambiar={setCombustible}
        />
      </View>

      <View style={estilos.divisor} />

      {/* Sección 3: evidencia visual. */}
      <View>
        <CapturaFoto
          etiqueta={t("checkInForm.fotoTablero")}
          ayuda={t("checkInForm.fotoTableroAyuda")}
          uri={fotoTacometro}
          onCapturada={setFotoTacometro}
        />

        <CapturaFoto
          etiqueta={t("checkInForm.fotoHojaRuta")}
          ayuda={t("checkInForm.fotoHojaRutaAyuda")}
          uri={fotoRuta}
          onCapturada={setFotoRuta}
        />
      </View>

      <View style={estilos.divisor} />

      {/* Sección 4: observaciones y envío. */}
      <View>
        <CampoTexto
          ref={refIncidencias}
          etiqueta={t("checkInForm.incidenciasEtiqueta")}
          placeholder={t("checkInForm.incidenciasPlaceholder")}
          multiline
          numberOfLines={4}
          style={estilos.incidencias}
          value={incidencias}
          onChangeText={setIncidencias}
          onFocus={manejarFocusIncidencias}
        />

        <BotonPrimario
          titulo={t("checkInForm.botonEnviar")}
          onPress={manejarEnviar}
          cargando={enviando}
          deshabilitado={!formularioValido}
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
  incidencias: {
    minHeight: 100,
    textAlignVertical: "top",
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
