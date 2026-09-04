import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

interface OpcionEspecial {
  texto: string;
  onPress: () => void;
}

interface Props {
  etiqueta: string;
  valor: string | null;
  opciones: string[];
  placeholder: string;
  onSeleccionar: (opcion: string) => void;
  deshabilitado?: boolean;
  textoDeshabilitado?: string;
  opcionEspecial?: OpcionEspecial;
}

// Dropdown genérico construido desde cero (TouchableOpacity + Modal + FlatList,
// sin librerías externas) para reutilizar en Empresa y Ruta dentro de CheckInForm.
export function SelectorDesplegable({
  etiqueta,
  valor,
  opciones,
  placeholder,
  onSeleccionar,
  deshabilitado = false,
  textoDeshabilitado,
  opcionEspecial,
}: Props) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: deshabilitado }}
        disabled={deshabilitado}
        onPress={() => setAbierto(true)}
        activeOpacity={0.7}
        style={[estilos.selector, deshabilitado && estilos.selectorDeshabilitado]}
      >
        <Text
          style={
            deshabilitado
              ? estilos.textoDeshabilitado
              : valor
                ? estilos.textoSeleccionado
                : estilos.textoPlaceholder
          }
        >
          {deshabilitado ? (textoDeshabilitado ?? placeholder) : (valor ?? placeholder)}
        </Text>
        <Ionicons
          name="chevron-down"
          size={20}
          color={deshabilitado ? colores.deshabilitado : colores.textoSecundario}
        />
      </TouchableOpacity>

      <Modal visible={abierto} animationType="slide" transparent onRequestClose={() => setAbierto(false)}>
        <TouchableOpacity style={estilos.fondo} activeOpacity={1} onPress={() => setAbierto(false)}>
          <View style={estilos.hoja} onStartShouldSetResponder={() => true}>
            <Text style={estilos.hojaTitulo}>{etiqueta}</Text>
            <FlatList
              data={opciones}
              keyExtractor={(item) => item}
              ListEmptyComponent={
                <Text style={estilos.textoVacio}>{t("selectorDesplegable.sinOpciones")}</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: item === valor }}
                  activeOpacity={0.7}
                  onPress={() => {
                    onSeleccionar(item);
                    setAbierto(false);
                  }}
                  style={[estilos.opcion, item === valor && estilos.opcionSeleccionada]}
                >
                  <Text style={[estilos.textoOpcion, item === valor && estilos.textoOpcionSeleccionada]}>
                    {item}
                  </Text>
                  {item === valor ? <Ionicons name="checkmark" size={20} color={colores.primario} /> : null}
                </TouchableOpacity>
              )}
              ListFooterComponent={
                opcionEspecial ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.7}
                    onPress={() => {
                      setAbierto(false);
                      opcionEspecial.onPress();
                    }}
                    style={estilos.opcionEspecial}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colores.primario} />
                    <Text style={estilos.textoOpcionEspecial}>{opcionEspecial.texto}</Text>
                  </TouchableOpacity>
                ) : null
              }
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    marginBottom: espaciado.md,
  },
  etiqueta: {
    ...tipografia.cuerpo,
    marginBottom: espaciado.xs,
    fontWeight: "600",
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.sm,
    paddingHorizontal: espaciado.md,
    paddingVertical: espaciado.sm,
    backgroundColor: colores.superficie,
    minHeight: 52,
  },
  selectorDeshabilitado: {
    backgroundColor: colores.fondo,
    borderColor: colores.borde,
  },
  textoSeleccionado: {
    ...tipografia.cuerpo,
    color: colores.textoPrincipal,
  },
  textoPlaceholder: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
  },
  textoDeshabilitado: {
    ...tipografia.cuerpo,
    color: colores.deshabilitado,
  },
  fondo: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  hoja: {
    backgroundColor: colores.superficie,
    borderTopLeftRadius: radios.md,
    borderTopRightRadius: radios.md,
    paddingTop: espaciado.md,
    paddingBottom: espaciado.xl,
    maxHeight: "70%",
  },
  hojaTitulo: {
    ...tipografia.subtitulo,
    paddingHorizontal: espaciado.lg,
    marginBottom: espaciado.sm,
  },
  opcion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.md,
  },
  opcionSeleccionada: {
    backgroundColor: colores.fondo,
  },
  textoOpcion: {
    ...tipografia.cuerpo,
  },
  textoOpcionSeleccionada: {
    fontWeight: "600",
    color: colores.primario,
  },
  opcionEspecial: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaciado.sm,
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.md,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
  },
  textoOpcionEspecial: {
    ...tipografia.cuerpo,
    color: colores.primario,
    fontWeight: "600",
  },
  textoVacio: {
    ...tipografia.ayuda,
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.md,
  },
});
