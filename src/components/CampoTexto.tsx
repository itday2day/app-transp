import React, { forwardRef } from "react";
import { View, Text, TextInput, StyleSheet, TextInputProps } from "react-native";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

interface Props extends TextInputProps {
  etiqueta: string;
  error?: string;
}

export const CampoTexto = forwardRef<TextInput, Props>(function CampoTexto(
  { etiqueta, error, style, ...resto },
  ref
) {
  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <TextInput
        ref={ref}
        style={[estilos.input, Boolean(error) && estilos.inputConError, style]}
        placeholderTextColor={colores.textoSecundario}
        {...resto}
      />
      {error ? <Text style={estilos.textoError}>{error}</Text> : null}
    </View>
  );
});

const estilos = StyleSheet.create({
  contenedor: {
    marginBottom: espaciado.md,
  },
  etiqueta: {
    ...tipografia.cuerpo,
    marginBottom: espaciado.xs,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.sm,
    paddingHorizontal: espaciado.md,
    paddingVertical: espaciado.sm,
    fontSize: 16,
    backgroundColor: colores.superficie,
    color: colores.textoPrincipal,
  },
  inputConError: {
    borderColor: colores.peligro,
  },
  textoError: {
    ...tipografia.ayuda,
    color: colores.peligro,
    marginTop: espaciado.xs,
  },
});
