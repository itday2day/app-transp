import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { NivelCombustible } from "@/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

// Paradas rápidas en valores redondos — 10 cubre la señal de "reserva/
// advertencia" que tenía el selector anterior de 5 niveles.
const PARADAS: NivelCombustible[] = [0, 10, 25, 50, 75, 100];

interface Props {
  etiqueta: string;
  valor: NivelCombustible | null;
  onCambiar: (nivel: NivelCombustible) => void;
}

function colorNivel(valor: number): string {
  if (valor <= 10) return colores.peligro;
  if (valor <= 25) return colores.advertencia;
  return colores.exito;
}

export function SelectorCombustible({ etiqueta, valor, onCambiar }: Props) {
  const porcentaje = valor ?? 0;

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.filaEtiqueta}>
        <Text style={estilos.etiqueta}>{etiqueta}</Text>
        <Text style={[estilos.valorTexto, { color: colorNivel(porcentaje) }]}>
          {valor === null ? "—" : `${valor}%`}
        </Text>
      </View>

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
              onPress={() => onCambiar(parada)}
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
