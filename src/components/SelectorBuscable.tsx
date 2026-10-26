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

interface OpcionEspecial {
  texto: string;
  onPress: () => void;
}

interface Props<T> {
  etiqueta: string;
  placeholder: string;
  valor: T | null;
  opciones: T[];
  obtenerEtiqueta: (item: T) => string;
  /** P2 (spec_ajustes_pantalla_registro_limites_campos.md): texto del botón CERRADO, si es
   * distinto del texto de cada fila de la lista abierta (ej. CampoTelefono: cerrado muestra solo
   * "+34", la lista sigue mostrando "España (+34)"). Por defecto, el mismo `obtenerEtiqueta` —
   * ningún llamador existente cambia de comportamiento. */
  obtenerEtiquetaCompacta?: (item: T) => string;
  /** Clave única por opción, para `keyExtractor` y para saber cuál está
   * seleccionada. Por defecto, la misma etiqueta — alcanza cuando `T` ya es
   * un string simple (como la lista de empresas). */
  obtenerClave?: (item: T) => string;
  onSeleccionar: (item: T) => void;
  /** Criterio 18 (spec_catalogo_por_chofer.md): mismo prop/patrón que ya tiene
   * SelectorDesplegable.tsx -- una fila fija al final de la lista (FlatList ListFooterComponent),
   * tappable, que cierra el modal y dispara `onPress`. Usado por CheckInForm.tsx para la opción
   * "Agregar..." de empresa. */
  opcionEspecial?: OpcionEspecial;
  error?: string;
  /** Para lectores de pantalla cuando el título visible está oculto (`ocultarEtiquetaVisible`) o
   * cuando `etiqueta=""` -- por defecto, `etiqueta` (el texto visible del botón, cuando lo hay,
   * ya sirve de nombre accesible, como ya hacían SelectorFecha.tsx día/mes/año). */
  accessibilityLabel?: string;
  /** Criterio 10 (spec_ajustes_pantalla_registro_limites_campos.md): un solo título visible para
   * varios controles de una misma fila (ej. "Número de teléfono" cubre el prefijo Y el número) --
   * oculta el `<Text>{etiqueta}</Text>` de arriba del botón sin perder `etiqueta` como título de
   * la hoja modal ni como accessibilityLabel por defecto. */
  ocultarEtiquetaVisible?: boolean;
}

export function SelectorBuscable<T>({
  etiqueta,
  placeholder,
  valor,
  opciones,
  obtenerEtiqueta,
  obtenerEtiquetaCompacta = obtenerEtiqueta,
  obtenerClave = obtenerEtiqueta,
  onSeleccionar,
  opcionEspecial,
  error,
  accessibilityLabel = etiqueta || undefined,
  ocultarEtiquetaVisible = false,
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
      {ocultarEtiquetaVisible ? null : <Text style={estilos.etiqueta}>{etiqueta}</Text>}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => setAbierto(true)}
        activeOpacity={0.7}
        style={[estilos.selector, Boolean(error) && estilos.selectorConError]}
      >
        <Text style={valor != null ? estilos.textoSeleccionado : estilos.textoPlaceholder}>
          {valor != null ? obtenerEtiquetaCompacta(valor) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colores.textoSecundario} />
      </TouchableOpacity>
      {error ? <Text style={estilos.textoError}>{error}</Text> : null}

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
                ListFooterComponent={
                  opcionEspecial ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      activeOpacity={0.7}
                      onPress={() => {
                        cerrar();
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
  selectorConError: {
    borderColor: colores.peligro,
  },
  textoError: {
    ...tipografia.ayuda,
    color: colores.peligro,
    marginTop: espaciado.xs,
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
