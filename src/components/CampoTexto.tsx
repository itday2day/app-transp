import React, { forwardRef, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useEnfoqueTeclado } from "@/context/EnfoqueTecladoContext";
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
  /** Criterio 10 (spec_ajustes_pantalla_registro_limites_campos.md): un solo título visible para
   * varios controles de una misma fila (ej. "Número de teléfono" cubre el prefijo Y el número) --
   * oculta el `<Text>{etiqueta}</Text>` de arriba del campo. `accessibilityLabel` (ya heredado de
   * `TextInputProps`) es quien le da nombre al lector de pantalla en ese caso. */
  ocultarEtiquetaVisible?: boolean;
  /** Criterio 18 (spec_precarga_con_codigo_8_caracteres.md): fondo colores.advertenciaFondo y,
   * debajo, la línea "Cargado por Administración" -- también se agrega al accessibilityLabel
   * (criterio 10: la marca no depende solo del color). Sin esta prop (default `undefined`), el
   * campo se ve EXACTAMENTE igual que siempre -- ningún otro llamador de CampoTexto la pasa
   * (CheckInForm, CheckOutForm, IncidenciasForm, SelectorMatricula, LoginScreen,
   * CambiarContrasenaObligatorioScreen, CodigoVerificacionScreen, NuevaContrasenaScreen,
   * RecuperarContrasenaScreen -- confirmado por grep antes de escribir esto), así que ninguno
   * cambia. */
  precargado?: boolean;
}

export const CampoTexto = forwardRef<TextInput, Props>(function CampoTexto(
  {
    etiqueta,
    error,
    style,
    secureTextEntry,
    alternarVisibilidad,
    ocultarEtiquetaVisible,
    precargado,
    accessibilityLabel,
    onFocus,
    ...resto
  },
  ref
) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const ocultarTexto = alternarVisibilidad ? secureTextEntry && !visible : secureTextEntry;
  const refInterno = useRef<TextInput>(null);
  // spec_bloque_a_pantallas_checkin_checkout.md (ampliación, E2/criterio 25): null en cualquier
  // pantalla que no envuelva su contenido en ProveedorEnfoqueTeclado (login, cambiar contraseña,
  // etc.) -- ahí este campo se comporta exactamente igual que siempre.
  const enfoqueTeclado = useEnfoqueTeclado();

  // Corrección de la revisión: SIN `precargado`, el TextInput recibe EXACTAMENTE el
  // `accessibilityLabel` que le pasó el llamador (o `undefined`, si no pasó nada) -- igual que
  // antes de esta prop. El fallback a `etiqueta` (cuando la visible está oculta y nadie pasó un
  // accessibilityLabel explícito) SOLO se calcula para componer el sufijo, y solo se usa cuando
  // `precargado` es true -- nunca cambia lo que ya recibían las otras 9 pantallas que usan
  // CampoTexto sin esta prop.
  const etiquetaBase = accessibilityLabel ?? (ocultarEtiquetaVisible ? undefined : etiqueta);
  const etiquetaAccesible =
    precargado && etiquetaBase
      ? `${etiquetaBase}, ${t("registro.cargadoPorAdministracion")}`
      : accessibilityLabel;

  return (
    <View style={estilos.contenedor}>
      {ocultarEtiquetaVisible ? null : <Text style={estilos.etiqueta}>{etiqueta}</Text>}
      <View style={alternarVisibilidad ? estilos.filaInput : undefined}>
        <TextInput
          ref={(nodo) => {
            refInterno.current = nodo;
            if (typeof ref === "function") ref(nodo);
            else if (ref) ref.current = nodo;
          }}
          style={[
            estilos.input,
            alternarVisibilidad && estilos.inputConIcono,
            Boolean(error) && estilos.inputConError,
            precargado && estilos.inputPrecargado,
            style,
          ]}
          placeholderTextColor={colores.textoSecundario}
          secureTextEntry={ocultarTexto}
          accessibilityLabel={etiquetaAccesible}
          onFocus={(evento) => {
            enfoqueTeclado?.manejarFoco(refInterno);
            onFocus?.(evento);
          }}
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
      {/* Criterio 10: la línea visible es la que de verdad hace accesible la marca -- el color
          (estilos.inputPrecargado, arriba) nunca es la única señal. */}
      {precargado ? (
        <Text style={estilos.textoPrecargado}>{t("registro.cargadoPorAdministracion")}</Text>
      ) : null}
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
  // Decisión del usuario (2026-10-20): colores.advertenciaFondo, ya existente -- sin colores
  // nuevos (el mismo tono que ya usa la insignia de "jornada abierta" en TarjetaJornada.tsx).
  inputPrecargado: {
    backgroundColor: colores.advertenciaFondo,
  },
  textoPrecargado: {
    ...tipografia.ayuda,
    color: colores.textoSecundario,
    marginTop: espaciado.xs,
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
