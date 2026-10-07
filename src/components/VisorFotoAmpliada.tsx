import { useRef, useState } from "react";
import { Animated, Dimensions, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useFuenteFoto } from "@/hooks/useFuenteFoto";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// spec_mejoras_carga_jornada_fotos_enlaces.md (Pedido 3): zoom por doble toque + arrastrar en vez
// de pinch con dos dedos -- decisión tomada en la Fase 1 para no sumar react-native-gesture-handler
// ni react-native-reanimated (ninguna de las dos estaba instalada; sumar una obligaba a un build
// de EAS nuevo). Todo con PanResponder + Animated, ya parte de react-native, sin módulo nativo
// nuevo.
const ESCALA_AMPLIADA = 2.5;
const UMBRAL_CAMBIO_FOTO_PX = 80;
const VENTANA_DOBLE_TOQUE_MS = 300;
const TOLERANCIA_TOQUE_PX = 10;

interface Foto {
  uri?: string;
  url?: string;
}

interface Props {
  visible: boolean;
  fotos: Foto[];
  indiceInicial: number;
  onCerrar: () => void;
}

/** Visor de pantalla completa (criterios 8-11 de spec_mejoras_carga_jornada_fotos_enlaces.md):
 * X visible y back de Android (vía `onRequestClose` del propio Modal) cierran sin tocar la
 * pantalla de atrás; doble toque amplía/reduce; arrastrar mueve la foto ampliada o cambia de foto
 * cuando no lo está. Usa la misma cadena de respaldo del Hallazgo #46 (useFuenteFoto) -- el
 * llamante solo debe abrir este visor sobre una foto que la miniatura ya mostró con éxito. */
export function VisorFotoAmpliada({ visible, fotos, indiceInicial, onCerrar }: Props) {
  const { t } = useTranslation();
  // Ajusta `indice` durante el render en vez de en un efecto (misma recomendación de
  // react.dev/learn/you-might-not-need-an-effect: "ajustar estado cuando cambia una prop") -- solo
  // se re-sincroniza con `indiceInicial` justo cuando el visor pasa de cerrado a abierto, nunca
  // mientras el usuario ya está adentro pasando de una foto a otra.
  const [visibleAnterior, setVisibleAnterior] = useState(visible);
  const [indice, setIndice] = useState(indiceInicial);
  if (visible !== visibleAnterior) {
    setVisibleAnterior(visible);
    if (visible) setIndice(indiceInicial);
  }

  if (!visible) return null;
  const foto = fotos[indice];
  if (!foto) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar} statusBarTranslucent>
      <View style={estilos.fondo}>
        <PaginaFoto
          key={indice}
          uri={foto.uri}
          url={foto.url}
          hayAnterior={indice > 0}
          haySiguiente={indice < fotos.length - 1}
          onAnterior={() => setIndice((i) => Math.max(0, i - 1))}
          onSiguiente={() => setIndice((i) => Math.min(fotos.length - 1, i + 1))}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("visorFoto.cerrar")}
          onPress={onCerrar}
          style={estilos.botonCerrar}
          hitSlop={10}
        >
          <Ionicons name="close" size={28} color="#ffffff" />
        </Pressable>
      </View>
    </Modal>
  );
}

function PaginaFoto({
  uri,
  url,
  hayAnterior,
  haySiguiente,
  onAnterior,
  onSiguiente,
}: {
  uri?: string;
  url?: string;
  hayAnterior: boolean;
  haySiguiente: boolean;
  onAnterior: () => void;
  onSiguiente: () => void;
}) {
  const { t } = useTranslation();
  const { fuenteActual, alCargar, alFallar } = useFuenteFoto(uri, url);
  // useState (no useRef) para que el valor animado leído en el JSX de abajo no cuente como una
  // lectura de ref durante el render -- el objeto Animated.Value en sí sigue siendo el mismo a
  // través de los renders, nunca se reemplaza con setEscala/setPan.
  const [escala] = useState(() => new Animated.Value(1));
  const [pan] = useState(() => new Animated.ValueXY());
  // Animated.Value no se puede leer de forma sincrónica -- esta ref paralela es la que de verdad
  // decide, dentro de onPanResponderMove/Release, si el gesto actual arrastra (foto ampliada) o
  // cambia de foto (foto a tamaño normal).
  const ampliadaRef = useRef(false);
  const ultimoToque = useRef<{ t: number; x: number; y: number } | null>(null);
  const { width: anchoVentana, height: altoVentana } = Dimensions.get("window");

  function alternarZoom() {
    const nuevaAmpliada = !ampliadaRef.current;
    ampliadaRef.current = nuevaAmpliada;
    Animated.spring(escala, { toValue: nuevaAmpliada ? ESCALA_AMPLIADA : 1, useNativeDriver: false }).start();
    if (!nuevaAmpliada) {
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    }
  }

  // useState (no useRef) por el mismo motivo que escala/pan arriba. Se arma una sola vez (cada
  // PaginaFoto se remonta entera -- ver `key={indice}` en VisorFotoAmpliada -- así que los
  // closures de hayAnterior/haySiguiente/onAnterior/onSiguiente nunca quedan desactualizados: una
  // instancia vive exactamente mientras esa foto está en pantalla). ampliadaRef/ultimoToque se leen
  // solo dentro de los manejadores de gesto de abajo (se invocan recién al tocar/arrastrar, nunca
  // durante este render) -- el linter no puede ver que PanResponder.create() no los lee de
  // inmediato, solo los guarda para más tarde.
  // eslint-disable-next-line react-hooks/refs
  const [panResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evento, gesto) => {
        if (ampliadaRef.current) {
          const maxX = (anchoVentana * (ESCALA_AMPLIADA - 1)) / 2;
          const maxY = (altoVentana * (ESCALA_AMPLIADA - 1)) / 2;
          pan.setValue({
            x: Math.max(-maxX, Math.min(maxX, gesto.dx)),
            y: Math.max(-maxY, Math.min(maxY, gesto.dy)),
          });
        } else if (Math.abs(gesto.dx) > Math.abs(gesto.dy)) {
          pan.setValue({ x: gesto.dx, y: 0 });
        }
      },
      onPanResponderRelease: (_evento, gesto) => {
        const distancia = Math.sqrt(gesto.dx ** 2 + gesto.dy ** 2);
        if (distancia < TOLERANCIA_TOQUE_PX) {
          const ahora = Date.now();
          const anterior = ultimoToque.current;
          if (
            anterior &&
            ahora - anterior.t < VENTANA_DOBLE_TOQUE_MS &&
            Math.abs(gesto.x0 - anterior.x) < 40 &&
            Math.abs(gesto.y0 - anterior.y) < 40
          ) {
            ultimoToque.current = null;
            alternarZoom();
          } else {
            ultimoToque.current = { t: ahora, x: gesto.x0, y: gesto.y0 };
          }
          return;
        }

        if (ampliadaRef.current) return; // se queda clavada donde el clamp de arriba la dejó

        const fueHorizontal = Math.abs(gesto.dx) > Math.abs(gesto.dy);
        if (fueHorizontal && gesto.dx <= -UMBRAL_CAMBIO_FOTO_PX && haySiguiente) {
          onSiguiente();
          return;
        }
        if (fueHorizontal && gesto.dx >= UMBRAL_CAMBIO_FOTO_PX && hayAnterior) {
          onAnterior();
          return;
        }
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    })
  );

  if (!fuenteActual) {
    return (
      <View style={estilos.noDisponible}>
        <Ionicons name="image-outline" size={28} color={colores.textoSecundario} />
        <Text style={estilos.textoNoDisponible}>{t("detalleJornada.fotoNoDisponible")}</Text>
      </View>
    );
  }

  return (
    <View style={estilos.contenedorPagina} {...panResponder.panHandlers}>
      <Animated.Image
        key={fuenteActual}
        source={{ uri: fuenteActual }}
        style={[
          estilos.imagen,
          { transform: [{ scale: escala }, { translateX: pan.x }, { translateY: pan.y }] },
        ]}
        resizeMode="contain"
        onLoad={alCargar}
        onError={alFallar}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  },
  contenedorPagina: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  imagen: {
    width: "100%",
    height: "100%",
  },
  botonCerrar: {
    position: "absolute",
    top: espaciado.xl,
    right: espaciado.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  noDisponible: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: espaciado.sm,
  },
  textoNoDisponible: {
    ...tipografia.cuerpo,
    color: "#ffffff",
  },
});
