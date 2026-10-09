import React, { createContext, useContext, useEffect, useRef, useState, type RefObject } from "react";
import { Keyboard, UIManager, findNodeHandle, type ScrollView } from "react-native";
import { espaciado } from "@/theme/spacing";

// spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50, ampliación, E2/criterio 25): cuando
// un campo de texto recibe el foco, tiene que quedar visible por encima del teclado usando su
// ALTURA REAL (no un tiempo calibrado a ojo como antes) -- `Keyboard.addListener("keyboardDidShow")`
// es parte de react-native core, sin ningún módulo nativo nuevo. Un Context (no props por cada
// pantalla) porque el campo que de verdad recibe el foco vive varios componentes por debajo del
// ScrollView (CampoTexto, dentro de SelectorMatricula o de IncidenciasForm, dentro de
// CheckInForm/CheckOutForm) -- así ninguno de esos intermedios necesita saber que esto existe.
interface EnfoqueTecladoApi {
  manejarFoco: (campoRef: RefObject<unknown>) => void;
}

const EnfoqueTecladoContext = createContext<EnfoqueTecladoApi | null>(null);

/** `CampoTexto` lo consume solo -- si una pantalla no lo provee (login, cambiar contraseña, etc.),
 * esto es `null` y `CampoTexto` no hace nada distinto a hoy. */
export function useEnfoqueTeclado(): EnfoqueTecladoApi | null {
  return useContext(EnfoqueTecladoContext);
}

interface Props {
  scrollRef: RefObject<ScrollView | null>;
  children: React.ReactNode;
}

export function ProveedorEnfoqueTeclado({ scrollRef, children }: Props) {
  const [alturaTeclado, setAlturaTeclado] = useState(0);
  // Altura del ScrollView SIN teclado -- a propósito, nunca se actualiza mientras el teclado está
  // arriba. `KeyboardAvoidingView` (que ya envuelve a este ScrollView en las dos pantallas que
  // proveen este Context) encoge ese mismo ScrollView cuando el teclado aparece, así que su
  // `onLayout` vuelve a dispararse con un alto más chico mientras el teclado está arriba -- si
  // este valor lo reflejara, la resta de `alturaTeclado` más abajo contaría el teclado dos veces.
  // Guardar solo el alto "teclado abajo" y restar la altura real una sola vez, acá, deja el
  // cálculo correcto sin depender de en qué momento exacto `KeyboardAvoidingView` termina de
  // encoger el suyo.
  const altoScrollSinTeclado = useRef(0);
  // Un solo campo "pendiente" a la vez -- si el teclado ya estaba arriba (el chofer pasa de un
  // campo a otro con el mismo teclado abierto), no hace falta esperar a un nuevo keyboardDidShow,
  // que no vuelve a disparar.
  const pendiente = useRef<RefObject<unknown> | null>(null);

  // Mide el ScrollView directo (sin depender de que la pantalla le pase su propio `onLayout`,
  // que quedaría FUERA de este Provider en el árbol) -- al montar, y de nuevo cada vez que el
  // teclado se termina de ocultar (por si el layout cambió mientras tanto, ej. un campo que
  // apareció/desapareció del formulario).
  useEffect(() => {
    if (alturaTeclado > 0) return;
    const temporizador = setTimeout(() => {
      const nodoScroll = findNodeHandle(scrollRef.current);
      if (nodoScroll == null) return;
      UIManager.measure(nodoScroll, (_x, _y, _ancho, alto) => {
        if (alto > 0) altoScrollSinTeclado.current = alto;
      });
    }, 50);
    return () => clearTimeout(temporizador);
  }, [alturaTeclado, scrollRef]);

  useEffect(() => {
    const mostrar = Keyboard.addListener("keyboardDidShow", (evento) => {
      setAlturaTeclado(evento.endCoordinates.height);
    });
    const ocultar = Keyboard.addListener("keyboardDidHide", () => setAlturaTeclado(0));
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, []);

  function medirYDesplazar(campoRef: RefObject<unknown>, altura: number) {
    const scroll = scrollRef.current;
    const nodoCampo = findNodeHandle(campoRef.current as never);
    const nodoScroll = findNodeHandle(scroll);
    if (!scroll || nodoCampo == null || nodoScroll == null || altoScrollSinTeclado.current === 0) {
      return;
    }

    UIManager.measureLayout(
      nodoCampo,
      nodoScroll,
      () => {},
      (_left, top, _ancho, alto) => {
        const alturaVisible = altoScrollSinTeclado.current - altura;
        const objetivo = Math.max(0, top + alto + espaciado.md - alturaVisible);
        if (alturaVisible <= 0) return;
        scroll.scrollTo({ y: objetivo, animated: true });
      }
    );
  }

  useEffect(() => {
    if (alturaTeclado > 0 && pendiente.current) {
      medirYDesplazar(pendiente.current, alturaTeclado);
      pendiente.current = null;
    }
    // medirYDesplazar no es estable entre renders (cierra sobre scrollRef.current), pero solo
    // importa el valor más reciente en el momento en que el teclado avisa su altura real -- no
    // hace falta reaccionar a sus cambios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alturaTeclado]);

  function manejarFoco(campoRef: RefObject<unknown>) {
    if (alturaTeclado > 0) medirYDesplazar(campoRef, alturaTeclado);
    else pendiente.current = campoRef;
  }

  return <EnfoqueTecladoContext.Provider value={{ manejarFoco }}>{children}</EnfoqueTecladoContext.Provider>;
}
