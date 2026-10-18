import { useCallback, useEffect, useRef, useState } from "react";
import { segundosRestantes } from "@/utils/cuentaRegresiva";

const DURACION_POR_DEFECTO_SEGUNDOS = 60;
const INTERVALO_RERENDER_MS = 250;

export interface ResultadoCuentaRegresiva {
  segundosRestantes: number;
  terminada: boolean;
  /**
   * Reinicia el cronómetro desde Date.now() AHORA. Dos usos distintos, con distinto argumento:
   *   - Tras un envío real sin error (signUp, reenviarCodigo, pedirRecuperacion) -> `reiniciar()`
   *     sin argumento, usa los 60s por defecto: SÍ se mandó un correo nuevo, el cronómetro vuelve
   *     a empezar de cero.
   *   - Tras un 429 ("esperar", segundos) -> `reiniciar(segundos)` con los segundos EXACTOS que
   *     dio el servidor: un 429 significa que NO se mandó nada -- esto no es un reinicio por un
   *     envío nuevo, es una CORRECCIÓN del cronómetro ya corriendo al valor real del servidor
   *     (que manda si hay desfase de reloj entre el dispositivo y Supabase).
   */
  reiniciar: (duracionSegundos?: number) => void;
}

// `Date.now()` y la lectura/escritura de `inicioRef`/`duracionRef` SOLO pasan dentro de un efecto
// o de un callback (recalcular/reiniciar) -- nunca en el cuerpo del hook en sí. El render solo lee
// el estado `restantes`, ya calculado -- las reglas react-hooks/purity y react-hooks/refs exigen
// exactamente esto (un ref leído o un reloj llamado durante el render puede dar un resultado
// inestable entre renders).
export function useCuentaRegresiva(
  duracionInicialSegundos: number = DURACION_POR_DEFECTO_SEGUNDOS
): ResultadoCuentaRegresiva {
  const inicioRef = useRef<number | null>(null);
  const duracionRef = useRef(duracionInicialSegundos);
  const [restantes, setRestantes] = useState(duracionInicialSegundos);

  const recalcular = useCallback(() => {
    if (inicioRef.current === null) return;
    setRestantes(segundosRestantes(inicioRef.current, duracionRef.current, Date.now()));
  }, []);

  useEffect(() => {
    inicioRef.current = Date.now();
    recalcular();
    const intervalo = setInterval(recalcular, INTERVALO_RERENDER_MS);
    return () => clearInterval(intervalo);
  }, [recalcular]);

  const reiniciar = useCallback(
    (duracionSegundos?: number) => {
      inicioRef.current = Date.now();
      duracionRef.current = duracionSegundos ?? DURACION_POR_DEFECTO_SEGUNDOS;
      recalcular();
    },
    [recalcular]
  );

  return { segundosRestantes: restantes, terminada: restantes === 0, reiniciar };
}
