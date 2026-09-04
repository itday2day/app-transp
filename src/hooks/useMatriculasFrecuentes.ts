import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { obtenerMatriculasFrecuentes } from "@/db/jornadasRepo";
import { useAuth } from "@/context/AuthContext";

export function useMatriculasFrecuentes() {
  const { usuario } = useAuth();
  const [matriculas, setMatriculas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    const frecuentes = await obtenerMatriculasFrecuentes(usuario.id);
    setMatriculas(frecuentes);
    setCargando(false);
  }, [usuario]);

  useFocusEffect(
    useCallback(() => {
      recargar();
    }, [recargar])
  );

  return { matriculas, cargando };
}
