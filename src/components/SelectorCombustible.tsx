import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { NivelCombustible } from "@/types";
import { siguienteCombustible } from "./logicaSelectorCombustible";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

// Paradas rápidas en valores redondos — 10 cubre la señal de "reserva/
// advertencia" que tenía el selector anterior de 5 niveles.
const PARADAS: NivelCombustible[] = [0, 10, 25, 50, 75, 100];

interface Props {
  etiqueta: string;
  valor: NivelCombustible | null;
  onCambiar: (nivel: NivelCombustible | null) => void;
  error?: string;
  /** spec_ajustes_previos_apk.md, A4: con `true`, tocar el chip ya elegido lo deja en "sin
   * elegir" (`null`) -- la única forma de vaciar un campo opcional tras un toque equivocado. El
   * check-in lo activa (combustible inicial opcional); el check-out NO lo pasa (sigue exigiendo
   * un valor, igual que hoy). Default `false` para no cambiar nada donde no se pase. */
  permitirLimpiar?: boolean;
}

function colorNivel(valor: number): string {
  if (valor <= 10) return colores.peligro;
  if (valor <= 25) return colores.advertencia;
  return colores.exito;
}

export function SelectorCombustible({ etiqueta, valor, onCambiar, error, permitirLimpiar = false }: Props) {
  const porcentaje = valor ?? 0;

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.filaEtiqueta}>
        <Text style={estilos.etiqueta}>{etiqueta}</Text>
        <Text style={[estilos.valorTexto, { color: colorNivel(porcentaje) }]}>
          {valor === null ? "—" : `${valor}%`}
        </Text>
      </View>
      {error ? <Text style={estilos.textoError}>{error}</Text> : null}

      <View style={estilos.pista}>
        <View
          style={[estilos.relleno, { width: `${porcentaje}%`, backgroundColor: colorNivel(porcentaje) }]}
        />
      </View>

      <View style={estilos.filaChips}>
        {PARADAS.map((parada) => {
          const seleccionado = valor === parada;
          return (
            <Pressable
              key={parada}
              accessibilityRole="button"
              accessibilityState={{ selected: seleccionado }}
              onPress={() => onCambiar(siguienteCombustible(valor, parada, permitirLimpiar))}
              style={[estilos.chip, seleccionado && estilos.chipSeleccionado]}
            >
              <Text style={[estilos.textoChip, seleccionado && estilos.textoChipSeleccionado]}>
                {parada}%
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    marginBottom: espaciado.md,
  },
  filaEtiqueta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: espaciado.sm,
  },
  etiqueta: {
    ...tipografia.cuerpo,
    fontWeight: "600",
  },
  valorTexto: {
    ...tipografia.cuerpo,
    fontWeight: "700",
  },
  textoError: {
    ...tipografia.ayuda,
    color: colores.peligro,
    marginBottom: espaciado.sm,
  },
  pista: {
    height: 12,
    borderRadius: radios.full,
    backgroundColor: colores.borde,
    overflow: "hidden",
    marginBottom: espaciado.sm,
  },
  relleno: {
    height: "100%",
    borderRadius: radios.full,
  },
  filaChips: {
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
});
