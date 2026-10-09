import React, { forwardRef, useEffect, useRef, useState } from "react";
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
  error?: string;
}

// El `ref` expuesto apunta al campo manual (cuando está en ese modo) -- en modo lista no hay
// ningún TextInput al que darle foco, así que queda en null y el llamante (scrollAlCampo) no
// intenta enfocar nada, solo desplazarse (spec_bloque_a_pantallas_checkin_checkout.md).
export const SelectorMatricula = forwardRef<TextInput, Props>(function SelectorMatricula(
  { valor, onCambiar, opciones, error },
  ref
) {
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

  // spec_normalizacion_dni_matricula_telefono.md: mismo criterio que normalizarMatricula() del
  // Dashboard (dashboard/lib/vehiculos.ts) — mayúsculas, sin espacios NI GUIONES. Antes solo se
  // quitaban espacios; el maxLength={7} de abajo ya limitaba el largo.
  function manejarTextoManual(texto: string) {
    onCambiar(texto.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  }

  if (modoManual) {
    return (
      <View>
        <CampoTexto
          ref={(nodo) => {
            refMatriculaManual.current = nodo;
            if (typeof ref === "function") ref(nodo);
            else if (ref) ref.current = nodo;
          }}
          etiqueta={t("selectorMatricula.etiqueta")}
          placeholder={t("selectorMatricula.placeholderManual")}
          autoCapitalize="characters"
          maxLength={7}
          value={valor}
          onChangeText={manejarTextoManual}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
          error={error}
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
      error={error}
    />
  );
});

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
