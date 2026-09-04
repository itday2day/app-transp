import React from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

interface Props {
  titulo: string;
  onPress: () => void;
  cargando?: boolean;
  deshabilitado?: boolean;
  variante?: "primario" | "secundario" | "peligro";
  estilo?: ViewStyle;
}

export function BotonPrimario({
  titulo,
  onPress,
  cargando = false,
  deshabilitado = false,
  variante = "primario",
  estilo,
}: Props) {
  const inactivo = cargando || deshabilitado;

  const colorFondo = {
    primario: colores.primario,
    secundario: colores.superficie,
    peligro: colores.peligro,
  }[variante];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactivo }}
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [
        estilos.base,
        { backgroundColor: inactivo ? colores.deshabilitado : colorFondo },
        variante === "secundario" && estilos.bordeSecundario,
        pressed && !inactivo && estilos.presionado,
        estilo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={colores.superficie} />
      ) : (
        <Text style={[tipografia.boton, variante === "secundario" && { color: colores.primario }]}>
          {titulo}
        </Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radios.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: espaciado.lg,
  },
  bordeSecundario: {
    borderWidth: 1,
    borderColor: colores.primario,
  },
  presionado: {
    opacity: 0.85,
  },
});
