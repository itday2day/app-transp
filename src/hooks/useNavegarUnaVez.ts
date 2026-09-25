import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";

/**
 * Evita que un doble tap dispare `navigation.navigate` dos veces antes de que la primera
 * navegación complete — React Navigation no se protege solo contra esto: si las dos llamadas
 * ocurren antes de que la pantalla de origen pierda el foco, ninguna de las dos ve a la pantalla
 * destino como "ya activa", así que las dos empujan una instancia — la pantalla destino queda
 * montada dos veces apiladas, cada una con su propio estado (ej. dos `<BannerConexion />`
 * idénticas superpuestas en DetalleJornadaScreen, confirmado con un usuario real: al volver atrás
 * una vez desaparecía una sola franja, no las dos).
 *
 * El guard se resetea solo cuando la pantalla de ORIGEN (la que usa este hook, no la de destino)
 * vuelve a tener foco — recién ahí un tap nuevo tiene sentido: mientras la pantalla destino esté
 * activa, no hay ningún tap legítimo posible sobre la lista de origen.
 */
export function useNavegarUnaVez() {
  const bloqueadoRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      bloqueadoRef.current = false;
    }, [])
  );

  return useCallback((navegar: () => void) => {
    if (bloqueadoRef.current) return;
    bloqueadoRef.current = true;
    navegar();
  }, []);
}
