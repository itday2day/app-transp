import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, Keyboard, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { SelectorDesplegable } from "@/components/SelectorDesplegable";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

interface Props {
  valor: string;
  onCambiar: (matricula: string) => void;
  opciones: string[];
}

export function SelectorMatricula({ valor, onCambiar, opciones }: Props) {
  const { t } = useTranslation();
  const [modoManual, setModoManual] = useState(false);
  const refMatriculaManual = useRef<TextInput>(null);

  useEffect(() => {
    if (!modoManual) return;
    // Igual que en CheckInForm: se espera a que termine la animación de
    // cierre del modal de "Matrícula" antes de enfocar, si no el teclado se
    // abre y se cierra de inmediato.
    const temporizador = setTimeout(() => refMatriculaManual.current?.focus(), 350);
    return () => clearTimeout(temporizador);
  }, [modoManual]);

  function manejarTextoManual(texto: string) {
    onCambiar(texto.toUpperCase().replace(/\s+/g, ""));
  }

  if (modoManual) {
    return (
      <View>
        <CampoTexto
          ref={refMatriculaManual}
          etiqueta={t("selectorMatricula.etiqueta")}
          placeholder={t("selectorMatricula.placeholderManual")}
          autoCapitalize="characters"
          maxLength={7}
          value={valor}
          onChangeText={manejarTextoManual}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        {opciones.length > 0 ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setModoManual(false);
              onCambiar("");
            }}
            style={estilos.enlaceContenedor}
          >
            <Text style={estilos.enlace}>{t("checkInForm.elegirDeLaLista")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <SelectorDesplegable
      etiqueta={t("selectorMatricula.etiqueta")}
      placeholder={t("selectorMatricula.placeholderLista")}
      valor={valor || null}
      opciones={opciones}
      onSeleccionar={onCambiar}
      opcionEspecial={{
        texto: t("selectorMatricula.opcionManual"),
        onPress: () => {
          setModoManual(true);
          onCambiar("");
        },
      }}
    />
  );
}

const estilos = StyleSheet.create({
  enlaceContenedor: {
    marginTop: -espaciado.sm,
    marginBottom: espaciado.md,
  },
  enlace: {
    ...tipografia.cuerpo,
    color: colores.primario,
    fontWeight: "600",
  },
});
