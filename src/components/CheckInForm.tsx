import React, { useEffect, useRef, useState, type RefObject } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Keyboard, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { SelectorDesplegable } from "@/components/SelectorDesplegable";
import { SelectorMatricula } from "@/components/SelectorMatricula";
import { SelectorCombustible } from "@/components/SelectorCombustible";
import { CapturaFoto } from "@/components/CapturaFoto";
import { IncidenciasForm } from "@/components/IncidenciasForm";
import { BotonPrimario } from "@/components/BotonPrimario";
import { EMPRESAS, obtenerRutasDeEmpresa } from "@/data/empresas";
import { IncidenciaData, NivelCombustible, TipoIncidencia } from "@/types";
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
  tipoIncidenciaCheckin: TipoIncidencia | null;
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

  const detalleIncidenciaValido = incidencia.tipo !== "Otro" || incidencia.detalle.trim().length > 0;
  const formularioValido =
    empresa !== null &&
    matricula.trim().length > 0 &&
    ruta.trim().length > 0 &&
    Number(kmInicial) > 0 &&
    combustible !== null &&
    fotoTacometro !== null &&
    detalleIncidenciaValido;

  function manejarEnviar() {
    if (!formularioValido || !empresa || !combustible || !fotoTacometro) return;

    onEnviar({
      empresa,
      // spec_normalizacion_dni_matricula_telefono.md: red de seguridad además de la que ya aplica
      // SelectorMatricula en la entrada manual — cubre el camino de "elegir de la lista" de
      // matrículas frecuentes, que no pasa por esa normalización.
      matricula: matricula.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      ruta: ruta.trim(),
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
        <SelectorBuscable
          etiqueta={t("checkInForm.empresaEtiqueta")}
          placeholder={t("checkInForm.empresaPlaceholder")}
          valor={empresa}
          opciones={EMPRESAS}
          obtenerEtiqueta={(item) => item}
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

      {/* Sección 4: incidencia y envío. */}
      <View>
        <IncidenciasForm valor={incidencia} onCambiar={setIncidencia} scrollViewRef={scrollViewRef} />

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
