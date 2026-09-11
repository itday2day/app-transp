import React, { useRef, type RefObject } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView, findNodeHandle } from "react-native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { GaleriaFotosIncidencia } from "@/components/GaleriaFotosIncidencia";
import { IncidenciaData, TipoIncidencia } from "@/types";
import { ClaveTraduccion } from "@/i18n";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

const TIPOS_INCIDENCIA: TipoIncidencia[] = ["Avería vehículo", "Tráfico/Retraso", "Cliente ausente", "Otro"];

// El valor almacenado de TipoIncidencia se mantiene en español (es el dato
// persistido en SQLite); esta tabla solo mapea cada valor a la clave de
// traducción usada para mostrarlo en pantalla.
export const CLAVE_TIPO_INCIDENCIA: Record<TipoIncidencia, ClaveTraduccion> = {
  "Avería vehículo": "incidencias.tipoAveria",
  "Tráfico/Retraso": "incidencias.tipoTrafico",
  "Cliente ausente": "incidencias.tipoClienteAusente",
  Otro: "incidencias.tipoOtro",
};

interface Props {
  valor: IncidenciaData;
  onCambiar: (valor: IncidenciaData) => void;
  /** ScrollView de la pantalla contenedora (DetalleJornadaScreen) — se usa
   * para traer el campo de detalle a la vista cuando se enfoca. */
  scrollViewRef: RefObject<ScrollView | null>;
}

export function IncidenciasForm({ valor, onCambiar, scrollViewRef }: Props) {
  const { t } = useTranslation();
  const detalleObligatorio = valor.tipo === "Otro";
  const detalleFaltante = detalleObligatorio && valor.detalle.trim().length === 0;
  const refDetalle = useRef<TextInput>(null);

  // Este campo aparece recién cuando se elige "Sí" (tuvo incidencia) y crece
  // el formulario debajo de todo lo demás (km, combustible, foto) — es el más
  // propenso a quedar tapado por el teclado. measureLayout mide su posición
  // real respecto al ScrollView, sin depender de en qué nivel de anidamiento
  // esté (a diferencia de sumar offsets de onLayout a mano).
  function manejarFocusDetalle() {
    const scroll = scrollViewRef.current;
    const nodoScroll = scroll ? findNodeHandle(scroll) : null;
    if (!scroll || nodoScroll == null) return;
    refDetalle.current?.measureLayout(
      nodoScroll,
      (_left, top) => {
        scroll.scrollTo({ y: Math.max(0, top - espaciado.md), animated: true });
      },
      () => {}
    );
  }

  function manejarTuvoIncidencia(tuvoIncidencia: boolean) {
    onCambiar({ tuvoIncidencia, tipo: null, detalle: "", fotos: [] });
  }

  function manejarTipo(tipo: TipoIncidencia) {
    onCambiar({ ...valor, tipo });
  }

  function manejarDetalle(detalle: string) {
    onCambiar({ ...valor, detalle });
  }

  function manejarFotos(fotos: string[]) {
    onCambiar({ ...valor, fotos });
  }

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{t("incidencias.pregunta")}</Text>
      <View style={estilos.fila}>
        {[
          { texto: t("incidencias.no"), valor: false },
          { texto: t("incidencias.si"), valor: true },
        ].map((opcion) => {
          const seleccionado = valor.tuvoIncidencia === opcion.valor;
          return (
            <Pressable
              key={opcion.texto}
              accessibilityRole="button"
              accessibilityState={{ selected: seleccionado }}
              onPress={() => manejarTuvoIncidencia(opcion.valor)}
              style={[estilos.chip, seleccionado && estilos.chipSeleccionado]}
            >
              <Text style={[estilos.textoChip, seleccionado && estilos.textoChipSeleccionado]}>
                {opcion.texto}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {valor.tuvoIncidencia ? (
        <View style={estilos.bloqueDetalle}>
          <Text style={estilos.etiqueta}>{t("incidencias.tipoEtiqueta")}</Text>
          <View style={estilos.fila}>
            {TIPOS_INCIDENCIA.map((tipo) => {
              const seleccionado = valor.tipo === tipo;
              return (
                <Pressable
                  key={tipo}
                  accessibilityRole="button"
                  accessibilityState={{ selected: seleccionado }}
                  onPress={() => manejarTipo(tipo)}
                  style={[estilos.chip, seleccionado && estilos.chipSeleccionado]}
                >
                  <Text style={[estilos.textoChip, seleccionado && estilos.textoChipSeleccionado]}>
                    {t(CLAVE_TIPO_INCIDENCIA[tipo])}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <CampoTexto
            ref={refDetalle}
            etiqueta={`${t("incidencias.detalleEtiqueta")}${detalleObligatorio ? "" : t("incidencias.detalleOpcional")}`}
            placeholder={t("incidencias.detallePlaceholder")}
            multiline
            numberOfLines={4}
            style={estilos.detalle}
            value={valor.detalle}
            onChangeText={manejarDetalle}
            error={detalleFaltante ? t("incidencias.detalleError") : undefined}
            onFocus={manejarFocusDetalle}
          />

          <GaleriaFotosIncidencia fotos={valor.fotos} onCambiar={manejarFotos} />
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    marginBottom: espaciado.md,
  },
  etiqueta: {
    ...tipografia.cuerpo,
    fontWeight: "600",
    marginBottom: espaciado.sm,
  },
  fila: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: espaciado.sm,
  },
  chip: {
    paddingVertical: espaciado.sm,
    paddingHorizontal: espaciado.md,
    borderRadius: radios.full,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  chipSeleccionado: {
    backgroundColor: colores.primario,
    borderColor: colores.primario,
  },
  textoChip: {
    ...tipografia.cuerpo,
  },
  textoChipSeleccionado: {
    color: colores.superficie,
    fontWeight: "600",
  },
  bloqueDetalle: {
    marginTop: espaciado.md,
  },
  detalle: {
    minHeight: 100,
    textAlignVertical: "top",
  },
});
