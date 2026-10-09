import React, { forwardRef, useRef } from "react";
import { View, Text, Pressable, StyleSheet, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { GaleriaFotosIncidencia } from "@/components/GaleriaFotosIncidencia";
import { IncidenciaData, TipoIncidencia, TipoIncidenciaCheckin } from "@/types";
import { ClaveTraduccion } from "@/i18n";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

// spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50): el check-in y el check-out ofrecen
// tipos y una pregunta distintos -- parametrizado por props en vez de duplicar el componente.
export const TIPOS_INCIDENCIA_CHECKOUT: TipoIncidencia[] = [
  "Avería vehículo",
  "Tráfico/Retraso",
  "Cliente ausente",
  "Otro",
];

export const TIPOS_INCIDENCIA_CHECKIN: TipoIncidenciaCheckin[] = [
  "Mercancía dañada",
  "Faltante/Sobrante",
  "Temperatura fuera de rango",
  "Pedido/Documentación",
  "Avería vehículo",
  "Otro",
];

// El valor almacenado se mantiene en español (es el dato persistido en SQLite); esta tabla solo
// mapea cada valor a la clave de traducción usada para mostrarlo en pantalla. Dos mapas, no uno:
// "Avería vehículo"/"Otro" llevan una etiqueta distinta según el contexto, aunque el valor
// guardado sea el mismo (nunca dos valores para la misma idea en los reportes).
export const CLAVE_TIPO_INCIDENCIA_CHECKOUT: Record<TipoIncidencia, ClaveTraduccion> = {
  "Avería vehículo": "incidencias.tipoAveria",
  "Tráfico/Retraso": "incidencias.tipoTrafico",
  "Cliente ausente": "incidencias.tipoClienteAusente",
  Otro: "incidencias.tipoOtro",
};

// "Tráfico/Retraso"/"Cliente ausente" ya no se ofrecen en el check-in (ver TIPOS_INCIDENCIA_CHECKIN
// arriba) pero siguen siendo valores válidos en filas históricas -- DetalleJornadaScreen necesita
// poder mostrarlas igual, con la misma etiqueta que ya tenían.
export const CLAVE_TIPO_INCIDENCIA_CHECKIN: Record<TipoIncidenciaCheckin, ClaveTraduccion> = {
  "Avería vehículo": "incidencias.checkin.tipoAveria",
  "Tráfico/Retraso": "incidencias.tipoTrafico",
  "Cliente ausente": "incidencias.tipoClienteAusente",
  Otro: "incidencias.checkin.tipoOtro",
  "Mercancía dañada": "incidencias.checkin.tipoMercanciaDanada",
  "Faltante/Sobrante": "incidencias.checkin.tipoFaltanteSobrante",
  "Temperatura fuera de rango": "incidencias.checkin.tipoTemperatura",
  "Pedido/Documentación": "incidencias.checkin.tipoPedidoDocumentacion",
};

interface Props {
  pregunta: ClaveTraduccion;
  tipos: TipoIncidenciaCheckin[];
  etiquetasTipo: Record<string, ClaveTraduccion>;
  valor: IncidenciaData;
  onCambiar: (valor: IncidenciaData) => void;
}

// El `ref` expuesto apunta al campo de detalle -- es el único dato de este componente que puede
// quedar "faltante" al enviar (ver nota en CheckInForm.tsx/CheckOutForm.tsx: elegir un tipo nunca
// fue obligatorio, solo el detalle cuando el tipo es "Otro", y eso ya es así desde antes de este
// hallazgo). El formulario contenedor usa este ref para desplazarse y enfocar cuando el detalle es
// el primer campo pendiente. El desplazamiento al enfocar por un toque normal (no por ese aviso) lo
// resuelve CampoTexto solo, vía ProveedorEnfoqueTeclado (spec_bloque_a_pantallas_checkin_checkout.md,
// ampliación, E2) -- este componente ya no necesita su propio mecanismo ni el ref al ScrollView.
export const IncidenciasForm = forwardRef<TextInput, Props>(function IncidenciasForm(
  { pregunta, tipos, etiquetasTipo, valor, onCambiar },
  ref
) {
  const { t } = useTranslation();
  const detalleObligatorio = valor.tipo === "Otro";
  const detalleFaltante = detalleObligatorio && valor.detalle.trim().length === 0;
  const refDetalle = useRef<TextInput>(null);

  function manejarTuvoIncidencia(tuvoIncidencia: boolean) {
    onCambiar({ tuvoIncidencia, tipo: null, detalle: "", fotos: [] });
  }

  function manejarTipo(tipo: TipoIncidenciaCheckin) {
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
      <Text style={estilos.etiqueta}>{t(pregunta)}</Text>
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
            {tipos.map((tipo) => {
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
                    {t(etiquetasTipo[tipo])}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <CampoTexto
            ref={(nodo) => {
              refDetalle.current = nodo;
              if (typeof ref === "function") ref(nodo);
              else if (ref) ref.current = nodo;
            }}
            etiqueta={`${t("incidencias.detalleEtiqueta")}${detalleObligatorio ? "" : t("incidencias.detalleOpcional")}`}
            placeholder={t("incidencias.detallePlaceholder")}
            multiline
            numberOfLines={4}
            style={estilos.detalle}
            value={valor.detalle}
            onChangeText={manejarDetalle}
            error={detalleFaltante ? t("incidencias.detalleError") : undefined}
          />

          <GaleriaFotosIncidencia fotos={valor.fotos} onCambiar={manejarFotos} />
        </View>
      ) : null}
    </View>
  );
});

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
