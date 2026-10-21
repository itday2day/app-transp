import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, UIManager, findNodeHandle } from "react-native";

interface ResultadoOffsetSuperiorKAV {
  ref: React.RefObject<unknown>;
  onLayout: () => void;
  offset: number;
}

/**
 * [FIX64] Hallazgo #64 (teclado en Android): mide el borde superior ABSOLUTO (ventana, no
 * relativo al padre) del `KeyboardAvoidingView` al que se le pasen `ref`/`onLayout` -- SOLO
 * mientras el teclado está oculto, porque con `behavior="height"` el KAV encoge su propio alto
 * al mostrarse el teclado, y medirlo ahí daría un borde superior desplazado hacia abajo.
 * `KeyboardAvoidingView` es una clase (no `forwardRef`) que no expone `measureInWindow` en su
 * instancia -- por eso se usa `findNodeHandle` + `UIManager.measureInWindow`, el mismo patrón de
 * bajo nivel que ya usa EnfoqueTecladoContext.tsx para medir el ScrollView.
 */
export function useOffsetSuperiorKAV(): ResultadoOffsetSuperiorKAV {
  const ref = useRef<unknown>(null);
  const [offset, setOffset] = useState(0);
  const tecladoVisible = useRef(false);

  useEffect(() => {
    const mostrar = Keyboard.addListener("keyboardDidShow", () => {
      tecladoVisible.current = true;
    });
    const ocultar = Keyboard.addListener("keyboardDidHide", () => {
      tecladoVisible.current = false;
    });
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, []);

  const onLayout = useCallback(() => {
    if (tecladoVisible.current) return;
    const nodo = findNodeHandle(ref.current as never);
    if (nodo == null) return;
    UIManager.measureInWindow(nodo, (_left, top) => {
      if (top < 0) return;
      setOffset(top);
    });
  }, []);

  return { ref, onLayout, offset };
}
