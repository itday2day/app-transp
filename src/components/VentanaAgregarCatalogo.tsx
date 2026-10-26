import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useOffsetSuperiorKAV } from "@/hooks/useOffsetSuperiorKAV";
import {
  LARGO_MAXIMO_CATALOGO,
  formatearEntradaCatalogo,
  habilitadoParaAgregarCatalogo,
  resolverAgregarCatalogo,
} from "@/utils/agregarCatalogoTexto";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

// spec_catalogo_por_chofer.md, criterio 18: ventana "Agregar..." de empresa/ruta -- reemplaza al
// "modo ruta manual" de CheckInForm.tsx (eliminado). Criterio 20 (diagnóstico 9): KeyboardAvoiding-
// View envolviendo el contenido, con useOffsetSuperiorKAV() (mismo patrón ya resuelto que usa
// DetalleJornadaScreen.tsx) en vez del `behavior="height"` insuficiente que todavía tiene el Modal
// de SelectorBuscable.tsx -- ese componente queda fuera del alcance de esta spec. Las reglas de
// texto (mayúsculas/espacios/duplicado sin acentos) viven en agregarCatalogoTexto.ts, puras y sin
// imports de React/Expo, para poder probarse con Node puro.

interface Props {
  visible: boolean;
  tipo: "empresa" | "ruta";
  /** Lista actualmente visible en el selector correspondiente -- contra esto se compara el
   * duplicado (criterio 18: "ya está en la lista VISIBLE", no todo el catálogo). */
  opcionesVisibles: string[];
  onCerrar: () => void;
  /** `esNuevo=false` cuando el nombre (normalizado, sin acentos) ya estaba en `opcionesVisibles`
   * -- el llamador solo debe seleccionar `nombre` (la grafía YA existente, no la recién tipeada) y
   * avisar, sin tocar la base. `esNuevo=true` cuando hay que darlo de alta en
   * catalogoLocalPendiente antes de seleccionarlo. */
  onConfirmar: (nombre: string, esNuevo: boolean) => void;
}

export function VentanaAgregarCatalogo({ visible, tipo, opcionesVisibles, onCerrar, onConfirmar }: Props) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState("");
  const refInput = useRef<TextInput>(null);
  const { ref: refKAV, onLayout: onLayoutOffsetKAV, offset: offsetKAV } = useOffsetSuperiorKAV();

  // Enfoca al abrir -- NO limpia `texto` acá (react-hooks/set-state-in-effect: un setState
  // síncrono dentro de un efecto dispara un render en cascada evitable). La limpieza vive en los
  // propios manejadores de cierre (cerrar/manejarAgregar, abajo), disparados por una acción real
  // del usuario, nunca por un efecto reaccionando a `visible`.
  useEffect(() => {
    if (!visible) return;
    const temporizador = setTimeout(() => refInput.current?.focus(), 350);
    return () => clearTimeout(temporizador);
  }, [visible]);

  const textoFormateado = formatearEntradaCatalogo(texto);
  const habilitado = habilitadoParaAgregarCatalogo(textoFormateado);

  function cerrar() {
    setTexto("");
    onCerrar();
  }

  function manejarAgregar() {
    if (!habilitado) return;
    const { nombre, esNuevo } = resolverAgregarCatalogo(textoFormateado, opcionesVisibles);
    setTexto("");
    onConfirmar(nombre, esNuevo);
  }

  const titulo = tipo === "empresa" ? t("agregarCatalogo.tituloEmpresa") : t("agregarCatalogo.tituloRuta");
  const placeholder =
    tipo === "empresa" ? t("agregarCatalogo.placeholderEmpresa") : t("agregarCatalogo.placeholderRuta");

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={cerrar}>
      <KeyboardAvoidingView
        ref={refKAV as never}
        style={estilos.contenedorTeclado}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : offsetKAV}
        onLayout={onLayoutOffsetKAV}
      >
        <Pressable style={estilos.fondo} onPress={cerrar}>
          <Pressable style={estilos.hoja} onPress={(evento) => evento.stopPropagation()}>
            <Text style={estilos.titulo} accessibilityRole="header">
              {titulo}
            </Text>
            <TextInput
              ref={refInput}
              style={estilos.campo}
              value={texto}
              onChangeText={setTexto}
              placeholder={placeholder}
              placeholderTextColor={colores.textoSecundario}
              autoCapitalize="characters"
              maxLength={LARGO_MAXIMO_CATALOGO}
              accessibilityLabel={titulo}
              returnKeyType="done"
            />
            <View style={estilos.botones}>
              <TouchableOpacity
                accessibilityRole="button"
                style={[estilos.boton, estilos.botonCancelar]}
                onPress={cerrar}
              >
                <Text style={estilos.textoBotonCancelar}>{t("agregarCatalogo.botonCancelar")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: !habilitado }}
                disabled={!habilitado}
                style={[estilos.boton, estilos.botonAgregar, !habilitado && estilos.botonDeshabilitado]}
                onPress={manejarAgregar}
              >
                <Text style={estilos.textoBotonAgregar}>{t("agregarCatalogo.botonAgregar")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
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
    padding: espaciado.lg,
    paddingBottom: espaciado.xl,
  },
  titulo: {
    ...tipografia.subtitulo,
    marginBottom: espaciado.md,
  },
  campo: {
    ...tipografia.cuerpo,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.sm,
    paddingHorizontal: espaciado.md,
    paddingVertical: espaciado.sm,
    minHeight: 44,
    color: colores.textoPrincipal,
  },
  botones: {
    flexDirection: "row",
    gap: espaciado.sm,
    marginTop: espaciado.lg,
  },
  boton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radios.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  botonCancelar: {
    backgroundColor: colores.fondo,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  botonAgregar: {
    backgroundColor: colores.primario,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  textoBotonCancelar: {
    ...tipografia.cuerpo,
    fontWeight: "600",
    color: colores.textoPrincipal,
  },
  textoBotonAgregar: {
    ...tipografia.cuerpo,
    fontWeight: "600",
    color: colores.superficie,
  },
});
