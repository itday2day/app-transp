import React, { forwardRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, Keyboard } from "react-native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { SelectorCombustible } from "@/components/SelectorCombustible";
import { CapturaFoto } from "@/components/CapturaFoto";
import { IncidenciasForm } from "@/components/IncidenciasForm";
import { BotonPrimario } from "@/components/BotonPrimario";
import { IncidenciaData, Jornada, NivelCombustible, TipoIncidencia } from "@/types";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

export interface ValoresCheckOutForm {
  kmFinal: number;
  combustibleFinal: NivelCombustible;
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
  { jornada, onEnviar, onCancelar, enviando },
  ref
) {
  const { t } = useTranslation();
  const [kmFinal, setKmFinal] = useState("");
  const [combustible, setCombustible] = useState<NivelCombustible | null>(null);
  const [fotoTacometro, setFotoTacometro] = useState<string | null>(null);
  const [incidencia, setIncidencia] = useState<IncidenciaData>(INCIDENCIA_INICIAL);

  const kmValido = Number(kmFinal) >= jornada.kmInicial;
  const detalleIncidenciaValido = incidencia.tipo !== "Otro" || incidencia.detalle.trim().length > 0;
  const formularioValido =
    kmValido && combustible !== null && fotoTacometro !== null && detalleIncidenciaValido;

  function manejarEnviar() {
    if (!formularioValido || !combustible || !fotoTacometro) return;

    onEnviar({
      kmFinal: Number(kmFinal),
      combustibleFinal: combustible,
      fotoTacometroFinalUri: fotoTacometro,
      tuvoIncidencia: incidencia.tuvoIncidencia,
      tipoIncidencia: incidencia.tuvoIncidencia ? incidencia.tipo : null,
      detalleIncidencia: incidencia.tuvoIncidencia ? incidencia.detalle.trim() : "",
      fotosIncidenciaUris: incidencia.tuvoIncidencia ? incidencia.fotos : [],
    });
  }

  return (
    <View>
      <CampoTexto
        ref={ref}
        etiqueta={t("checkOutForm.kmFinalEtiqueta")}
        placeholder={t("checkOutForm.kmFinalPlaceholder", { km: jornada.kmInicial })}
        keyboardType="numeric"
        returnKeyType="done"
        onSubmitEditing={() => Keyboard.dismiss()}
        value={kmFinal}
        onChangeText={setKmFinal}
        error={
          kmFinal.length > 0 && !kmValido
            ? t("checkOutForm.kmFinalError", { km: jornada.kmInicial })
            : undefined
        }
      />

      <SelectorCombustible
        etiqueta={t("checkOutForm.combustibleEtiqueta")}
        valor={combustible}
        onCambiar={setCombustible}
      />

      <CapturaFoto
        etiqueta={t("checkOutForm.fotoTacometro")}
        ayuda={t("checkOutForm.fotoTacometroAyuda")}
        uri={fotoTacometro}
        onCapturada={setFotoTacometro}
      />

      <IncidenciasForm valor={incidencia} onCambiar={setIncidencia} />

      <Text style={estilos.notaUbicacion}>{t("checkOutForm.notaUbicacion")}</Text>

      <BotonPrimario
        titulo={t("checkOutForm.botonEnviar")}
        onPress={manejarEnviar}
        cargando={enviando}
        deshabilitado={!formularioValido}
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
