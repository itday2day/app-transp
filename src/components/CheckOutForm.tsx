import React, { forwardRef, useEffect, useRef, useState, type RefObject } from "react";
import { View, Text, StyleSheet, TextInput, Keyboard, ScrollView, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { SelectorCombustible } from "@/components/SelectorCombustible";
import { CapturaFoto } from "@/components/CapturaFoto";
import {
  IncidenciasForm,
  TIPOS_INCIDENCIA_CHECKOUT,
  CLAVE_TIPO_INCIDENCIA_CHECKOUT,
} from "@/components/IncidenciasForm";
import { BotonPrimario } from "@/components/BotonPrimario";
import { IncidenciaData, Jornada, NivelCombustible, TipoIncidencia } from "@/types";
import { scrollAlCampo } from "@/utils/scrollAlCampo";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

export interface ValoresCheckOutForm {
  kmFinal: number;
  combustibleFinal: NivelCombustible | null;
  fotoTacometroFinalUri: string;
  tuvoIncidencia: boolean;
  tipoIncidencia: TipoIncidencia | null;
  detalleIncidencia: string;
  fotosIncidenciaUris: string[];
}

interface Props {
  jornada: Jornada;
  onEnviar: (valores: ValoresCheckOutForm) => void;
  onCancelar: () => void;
  enviando: boolean;
  /** ScrollView de DetalleJornadaScreen — se reenvía a IncidenciasForm para
   * traer su campo de detalle a la vista cuando se enfoca. */
  scrollViewRef: RefObject<ScrollView | null>;
}

const INCIDENCIA_INICIAL: IncidenciaData = {
  tuvoIncidencia: false,
  tipo: null,
  detalle: "",
  fotos: [],
};

// El ref del input de km final se expone al padre (DetalleJornadaScreen), que
// es quien coordina el scroll hacia esta sección con el autofoco — ver el
// useEffect de scroll+foco allá. Este componente ya no se autofoca solo.
export const CheckOutForm = forwardRef<TextInput, Props>(function CheckOutForm(
  { jornada, onEnviar, onCancelar, enviando, scrollViewRef },
  ref
) {
  const { t } = useTranslation();
  const [kmFinal, setKmFinal] = useState("");
  const [combustible, setCombustible] = useState<NivelCombustible | null>(null);
  const [fotoTacometro, setFotoTacometro] = useState<string | null>(null);
  const [incidencia, setIncidencia] = useState<IncidenciaData>(INCIDENCIA_INICIAL);
  const [mostrarErrores, setMostrarErrores] = useState(false);

  // spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50): mismos objetivos de scroll/foco
  // que CheckInForm.tsx, en el orden de pantalla. `refKmFinalInterno` fusiona el ref externo (el
  // que ya usaba DetalleJornadaScreen para su propio scroll+autofoco al revelar el formulario) con
  // el que esta validación necesita para sí misma -- un solo TextInput, dos dueños del ref.
  const refKmFinalInterno = useRef<TextInput>(null);
  const refContCombustible = useRef<View>(null);
  const refContFotoTacometro = useRef<View>(null);
  const refDetalleIncidencia = useRef<TextInput>(null);
  const yaEnviando = useRef(false);

  const kmValido = Number(kmFinal) >= jornada.kmInicial;
  const kmFaltante = kmFinal.trim().length === 0;
  const detalleIncidenciaValido = incidencia.tipo !== "Otro" || incidencia.detalle.trim().length > 0;

  useEffect(() => {
    if (!enviando) yaEnviando.current = false;
  }, [enviando]);

  function manejarEnviar() {
    if (yaEnviando.current) return;

    // Orden de pantalla: km final, combustible, foto del tacómetro, detalle de incidencia (solo
    // si corresponde). El aviso rojo en vivo de "menor al inicial" (criterio 17) es aparte: si el
    // campo está vacío entra en esta lista como cualquier otro obligatorio; si tiene un valor
    // inválido, ya se está mostrando ese aviso y basta con desplazarse hasta ahí.
    const campos = [
      {
        falta: kmFaltante || !kmValido,
        etiqueta: t("checkOutForm.kmFinalEtiqueta"),
        contRef: refKmFinalInterno,
        focoRef: refKmFinalInterno,
      },
      {
        falta: fotoTacometro === null,
        etiqueta: t("checkOutForm.fotoTacometro"),
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

    // spec_app_build1_ajustes.md, criterios 1-2: el combustible final deja de ser obligatorio --
    // `combustible` viaja tal cual (null o un número, 0 incluido) a onEnviar.
    if (!fotoTacometro) return; // nunca debería pasar: ya validado arriba

    yaEnviando.current = true;
    onEnviar({
      kmFinal: Number(kmFinal),
      combustibleFinal: combustible,
      fotoTacometroFinalUri: fotoTacometro,
      tuvoIncidencia: incidencia.tuvoIncidencia,
      // IncidenciasForm acá se parametriza con TIPOS_INCIDENCIA_CHECKOUT (4 tipos, sin cambios) --
      // el valor real nunca puede ser uno de los 4 nuevos del check-in.
      tipoIncidencia: incidencia.tuvoIncidencia ? (incidencia.tipo as TipoIncidencia | null) : null,
      detalleIncidencia: incidencia.tuvoIncidencia ? incidencia.detalle.trim() : "",
      fotosIncidenciaUris: incidencia.tuvoIncidencia ? incidencia.fotos : [],
    });
  }

  return (
    <View>
      <CampoTexto
        ref={(nodo) => {
          refKmFinalInterno.current = nodo;
          if (typeof ref === "function") ref(nodo);
          else if (ref) ref.current = nodo;
        }}
        etiqueta={t("checkOutForm.kmFinalEtiqueta")}
        keyboardType="numeric"
        returnKeyType="done"
        onSubmitEditing={() => Keyboard.dismiss()}
        value={kmFinal}
        onChangeText={setKmFinal}
        error={
          kmFinal.length > 0 && !kmValido
            ? t("checkOutForm.kmFinalError", { km: jornada.kmInicial })
            : mostrarErrores && kmFaltante
              ? t("comun.campoObligatorio")
              : undefined
        }
      />

      <View ref={refContCombustible}>
        {/* spec_app_build1_ajustes.md, criterio 1: mismo sufijo que incidencias.detalleOpcional
            (reutilizado, igual que ya hace checkInForm.combustibleEtiqueta) y permitirLimpiar,
            para poder volver a "sin elegir" tras tocar un chip por error. */}
        <SelectorCombustible
          etiqueta={`${t("checkOutForm.combustibleEtiqueta")}${t("incidencias.detalleOpcional")}`}
          valor={combustible}
          onCambiar={setCombustible}
          permitirLimpiar
        />
      </View>

      <View ref={refContFotoTacometro}>
        <CapturaFoto
          etiqueta={t("checkOutForm.fotoTacometro")}
          ayuda={t("checkOutForm.fotoTacometroAyuda")}
          icono="speedometer-outline"
          uri={fotoTacometro}
          onCapturada={setFotoTacometro}
          error={mostrarErrores && fotoTacometro === null ? t("comun.campoObligatorio") : undefined}
        />
      </View>

      <IncidenciasForm
        ref={refDetalleIncidencia}
        pregunta="incidencias.pregunta"
        tipos={TIPOS_INCIDENCIA_CHECKOUT}
        etiquetasTipo={CLAVE_TIPO_INCIDENCIA_CHECKOUT}
        valor={incidencia}
        onCambiar={setIncidencia}
      />

      <Text style={estilos.notaUbicacion}>{t("checkOutForm.notaUbicacion")}</Text>

      <BotonPrimario
        titulo={t("checkOutForm.botonEnviar")}
        onPress={manejarEnviar}
        cargando={enviando}
        deshabilitado={enviando}
        estilo={estilos.boton}
      />

      <BotonPrimario
        titulo={t("comun.cancelar")}
        onPress={onCancelar}
        variante="secundario"
        deshabilitado={enviando}
        estilo={estilos.botonCancelar}
      />
    </View>
  );
});

const estilos = StyleSheet.create({
  notaUbicacion: {
    ...tipografia.ayuda,
    marginBottom: espaciado.md,
  },
  boton: {
    marginTop: espaciado.sm,
  },
  botonCancelar: {
    marginTop: espaciado.sm,
  },
});
