import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { obtenerJornadasAbiertas } from "@/db/jornadasRepo";
import { Jornada } from "@/types";
import { useAuth } from "@/context/AuthContext";

// Un chofer puede tener varios viajes en curso a la vez (ver Tarea 6), así
// que este hook expone el arreglo completo en vez de una sola jornada.
export function useJornadasAbiertas() {
  const { usuario } = useAuth();
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    const abiertas = await obtenerJornadasAbiertas(usuario.id);
    setJornadas(abiertas);
    setCargando(false);
  }, [usuario]);

  useFocusEffect(
    useCallback(() => {
      recargar();
    }, [recargar])
  );

  return { jornadas, cargando, recargar };
}
