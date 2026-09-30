import React, { forwardRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

interface Props extends TextInputProps {
  etiqueta: string;
  error?: string;
  /** spec_cambio_contrasena_login.md: solo tiene efecto junto con `secureTextEntry` — agrega un
   * ícono de ojo que alterna mostrar/ocultar el texto tipeado al tocarlo (no cambia el tipo de
   * teclado, `keyboardType` no se toca). No es el comportamiento por defecto de todo campo de
   * contraseña del proyecto — cada pantalla lo pide explícitamente. */
  alternarVisibilidad?: boolean;
}

export const CampoTexto = forwardRef<TextInput, Props>(function CampoTexto(
  { etiqueta, error, style, secureTextEntry, alternarVisibilidad, ...resto },
  ref
) {
  const [visible, setVisible] = useState(false);
  const ocultarTexto = alternarVisibilidad ? secureTextEntry && !visible : secureTextEntry;

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <View style={alternarVisibilidad ? estilos.filaInput : undefined}>
        <TextInput
          ref={ref}
          style={[
            estilos.input,
            alternarVisibilidad && estilos.inputConIcono,
            Boolean(error) && estilos.inputConError,
            style,
          ]}
          placeholderTextColor={colores.textoSecundario}
          secureTextEntry={ocultarTexto}
          {...resto}
        />
        {alternarVisibilidad && (
          <Pressable
            onPress={() => setVisible((actual) => !actual)}
            style={estilos.iconoOjo}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            <Ionicons
              name={visible ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colores.textoSecundario}
            />
          </Pressable>
        )}
      </View>
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
  filaInput: {
    flexDirection: "row",
    alignItems: "center",
  },
  inputConIcono: {
    flex: 1,
    paddingRight: espaciado.xl,
  },
  iconoOjo: {
    position: "absolute",
    right: espaciado.md,
  },
  textoError: {
    ...tipografia.ayuda,
    color: colores.peligro,
    marginTop: espaciado.xs,
  },
});
