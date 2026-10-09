import { findNodeHandle, UIManager, type ScrollView, type TextInput, type View } from "react-native";
import { espaciado } from "@/theme/spacing";

// spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50): generaliza el mecanismo que ya usaba
// IncidenciasForm.tsx para el campo de detalle (findNodeHandle + UIManager.measureLayout contra el
// ref del ScrollView, después scrollTo) -- sin módulos nativos nuevos, criterio 19 de la spec.
const ESPERA_FOCO_MS = 350;

/** Desplaza `scrollRef` hasta la posición real de `campoRef` (cualquier nodo nativo: una View
 * contenedora o, si el propio campo lo expone, un TextInput) y, si se pasa `focoRef`, le da foco
 * después de esperar a que termine la animación del scroll -- mismo tiempo calibrado que ya usan
 * CheckInForm.tsx/SelectorMatricula.tsx para esto. */
export function scrollAlCampo(
  scrollRef: React.RefObject<ScrollView | null>,
  campoRef: React.RefObject<View | TextInput | null>,
  focoRef?: React.RefObject<TextInput | null>
) {
  const scroll = scrollRef.current;
  const nodoCampo = findNodeHandle(campoRef.current);
  const nodoScroll = findNodeHandle(scroll);
  if (!scroll || nodoCampo == null || nodoScroll == null) return;

  UIManager.measureLayout(
    nodoCampo,
    nodoScroll,
    () => {},
    (_left, top) => {
      scroll.scrollTo({ y: Math.max(0, top - espaciado.md), animated: true });
    }
  );

  if (focoRef) {
    setTimeout(() => focoRef.current?.focus(), ESPERA_FOCO_MS);
  }
}
