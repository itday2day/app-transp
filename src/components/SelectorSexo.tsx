import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Sexo } from "@/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

const OPCIONES: Sexo[] = ["Masculino", "Femenino", "Otro"];

interface Props {
  etiqueta: string;
  valor: Sexo | null;
  onCambiar: (sexo: Sexo) => void;
}

export function SelectorSexo({ etiqueta, valor, onCambiar }: Props) {
  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <View style={estilos.fila}>
        {OPCIONES.map((opcion) => {
          const seleccionado = valor === opcion;
          return (
            <Pressable
              key={opcion}
              accessibilityRole="button"
              accessibilityState={{ selected: seleccionado }}
              onPress={() => onCambiar(opcion)}
              style={[estilos.chip, seleccionado && estilos.chipSeleccionado]}
            >
              <Text style={[estilos.textoChip, seleccionado && estilos.textoChipSeleccionado]}>{opcion}</Text>
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
});
