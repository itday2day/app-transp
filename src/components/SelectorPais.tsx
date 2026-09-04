import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { PAISES } from "@/data/paises";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

const DIACRITICOS = /[̀-ͯ]/g;

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
}

interface Props {
  etiqueta: string;
  placeholder: string;
  valor: string | null;
  onSeleccionar: (nombrePais: string) => void;
}

export function SelectorPais({ etiqueta, placeholder, valor, onSeleccionar }: Props) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const paisesFiltrados = useMemo(() => {
    const consulta = normalizar(busqueda.trim());
    if (!consulta) return PAISES;
    return PAISES.filter((pais) => normalizar(pais.nombre).includes(consulta));
  }, [busqueda]);

  function cerrar() {
    setAbierto(false);
    setBusqueda("");
  }

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>

      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => setAbierto(true)}
        activeOpacity={0.7}
        style={estilos.selector}
      >
        <Text style={valor ? estilos.textoSeleccionado : estilos.textoPlaceholder}>
          {valor ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colores.textoSecundario} />
      </TouchableOpacity>

      <Modal visible={abierto} animationType="slide" transparent onRequestClose={cerrar}>
        <KeyboardAvoidingView
          style={estilos.contenedorTeclado}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={estilos.fondo} onPress={cerrar}>
            <Pressable style={estilos.hoja} onPress={(evento) => evento.stopPropagation()}>
              <Text style={estilos.hojaTitulo}>{etiqueta}</Text>

              <View style={estilos.buscadorContenedor}>
                <Ionicons name="search" size={18} color={colores.textoSecundario} />
                <TextInput
                  style={estilos.buscador}
                  placeholder={t("selectorPais.buscarPlaceholder")}
                  placeholderTextColor={colores.textoSecundario}
                  value={busqueda}
                  onChangeText={setBusqueda}
                  autoCorrect={false}
                />
              </View>

              <FlatList
                data={paisesFiltrados}
                keyExtractor={(item) => item.codigo}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text style={estilos.textoVacio}>{t("selectorPais.sinResultados")}</Text>}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{ selected: item.nombre === valor }}
                    activeOpacity={0.7}
                    onPress={() => {
                      onSeleccionar(item.nombre);
                      cerrar();
                    }}
                    style={[estilos.opcion, item.nombre === valor && estilos.opcionSeleccionada]}
                  >
                    <Text
                      style={[estilos.textoOpcion, item.nombre === valor && estilos.textoOpcionSeleccionada]}
                    >
                      {item.nombre}
                    </Text>
                    {item.nombre === valor ? (
                      <Ionicons name="checkmark" size={20} color={colores.primario} />
                    ) : null}
                  </TouchableOpacity>
                )}
              />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
  textoSeleccionado: {
    ...tipografia.cuerpo,
    color: colores.textoPrincipal,
  },
  textoPlaceholder: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
  },
  contenedorTeclado: {
    flex: 1,
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
    maxHeight: "60%",
  },
  hojaTitulo: {
    ...tipografia.subtitulo,
    paddingHorizontal: espaciado.lg,
    marginBottom: espaciado.sm,
  },
  buscadorContenedor: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaciado.sm,
    marginHorizontal: espaciado.lg,
    marginBottom: espaciado.sm,
    paddingHorizontal: espaciado.md,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.sm,
    backgroundColor: colores.fondo,
  },
  buscador: {
    flex: 1,
    paddingVertical: espaciado.sm,
    fontSize: 16,
    color: colores.textoPrincipal,
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
  textoVacio: {
    ...tipografia.ayuda,
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.md,
  },
});
