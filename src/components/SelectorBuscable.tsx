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
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

// Selector con buscador integrado, mismo patrón visual de hoja modal
// deslizable desde abajo que ya usa SelectorDesplegable — extraído de
// SelectorPais.tsx (que ya resolvía exactamente este problema, solo que
// hardcodeado a la lista de países de RegistroScreen) y generalizado para
// cualquier lista de opciones. SelectorPais.tsx ahora es un wrapper fino
// sobre este componente (mismo criterio que ya usa SelectorMatricula.tsx
// sobre SelectorDesplegable: un wrapper de dominio específico sobre un
// selector genérico).

const DIACRITICOS = /[̀-ͯ]/g;

// Filtro: coincidencia de subcadena, sin distinguir mayúsculas ni acentos —
// alcanza con normalizar (minúsculas + NFD + quitar diacríticos) los dos
// lados de la comparación, sin sumar ninguna librería de búsqueda difusa.
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
}

interface Props<T> {
  etiqueta: string;
  placeholder: string;
  valor: T | null;
  opciones: T[];
  obtenerEtiqueta: (item: T) => string;
  /** Clave única por opción, para `keyExtractor` y para saber cuál está
   * seleccionada. Por defecto, la misma etiqueta — alcanza cuando `T` ya es
   * un string simple (como la lista de empresas). */
  obtenerClave?: (item: T) => string;
  onSeleccionar: (item: T) => void;
}

export function SelectorBuscable<T>({
  etiqueta,
  placeholder,
  valor,
  opciones,
  obtenerEtiqueta,
  obtenerClave = obtenerEtiqueta,
  onSeleccionar,
}: Props<T>) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const opcionesFiltradas = useMemo(() => {
    const consulta = normalizar(busqueda.trim());
    if (!consulta) return opciones;
    return opciones.filter((item) => normalizar(obtenerEtiqueta(item)).includes(consulta));
  }, [busqueda, opciones, obtenerEtiqueta]);

  function cerrar() {
    setAbierto(false);
    setBusqueda("");
  }

  const claveValor = valor != null ? obtenerClave(valor) : null;

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>

      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => setAbierto(true)}
        activeOpacity={0.7}
        style={estilos.selector}
      >
        <Text style={valor != null ? estilos.textoSeleccionado : estilos.textoPlaceholder}>
          {valor != null ? obtenerEtiqueta(valor) : placeholder}
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
                  placeholder={t("selectorBuscable.buscarPlaceholder")}
                  placeholderTextColor={colores.textoSecundario}
                  value={busqueda}
                  onChangeText={setBusqueda}
                  autoCorrect={false}
                />
              </View>

              <FlatList
                data={opcionesFiltradas}
                keyExtractor={obtenerClave}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={estilos.textoVacio}>{t("selectorBuscable.sinResultados")}</Text>
                }
                renderItem={({ item }) => {
                  const seleccionado = obtenerClave(item) === claveValor;
                  return (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{ selected: seleccionado }}
                      activeOpacity={0.7}
                      onPress={() => {
                        onSeleccionar(item);
                        cerrar();
                      }}
                      style={[estilos.opcion, seleccionado && estilos.opcionSeleccionada]}
                    >
                      <Text style={[estilos.textoOpcion, seleccionado && estilos.textoOpcionSeleccionada]}>
                        {obtenerEtiqueta(item)}
                      </Text>
                      {seleccionado ? <Ionicons name="checkmark" size={20} color={colores.primario} /> : null}
                    </TouchableOpacity>
                  );
                }}
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
    maxHeight: "70%",
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
