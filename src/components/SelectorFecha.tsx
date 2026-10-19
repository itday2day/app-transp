import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { SelectorDesplegable } from "@/components/SelectorDesplegable";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

interface Props {
  etiqueta: string;
  valor: string | null; // ISO 8601 'YYYY-MM-DD' o null
  onCambiar: (fechaIso: string) => void;
  edadMinima?: number;
}

function diasEnMes(mesIndice: number, anio: number): number {
  return new Date(anio, mesIndice + 1, 0).getDate();
}

export function SelectorFecha({ etiqueta, valor, onCambiar, edadMinima = 18 }: Props) {
  const { t } = useTranslation();
  const MESES = t("selectorFecha.meses", { returnObjects: true }) as string[];
  const anioActual = new Date().getFullYear();
  const anioMaximo = anioActual - edadMinima;
  const anioMinimo = anioActual - 100;

  const aniosDisponibles = useMemo(() => {
    const anios: string[] = [];
    for (let anio = anioMaximo; anio >= anioMinimo; anio--) {
      anios.push(String(anio));
    }
    return anios;
  }, [anioMaximo, anioMinimo]);

  const [dia, setDia] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [anio, setAnio] = useState<string | null>(null);

  const mesIndice = mes ? MESES.indexOf(mes) : null;
  const diasDisponibles = useMemo(() => {
    const totalDias = mesIndice !== null && anio ? diasEnMes(mesIndice, Number(anio)) : 31;
    return Array.from({ length: totalDias }, (_, i) => String(i + 1).padStart(2, "0"));
  }, [mesIndice, anio]);

  function manejarSeleccion(nuevoDia: string | null, nuevoMes: string | null, nuevoAnio: string | null) {
    if (!nuevoDia || !nuevoMes || !nuevoAnio) {
      setDia(nuevoDia);
      setMes(nuevoMes);
      setAnio(nuevoAnio);
      return;
    }

    const indiceMes = MESES.indexOf(nuevoMes);
    const numeroAnio = Number(nuevoAnio);
    let numeroDia = Number(nuevoDia);

    // Al cambiar mes/año, un día que ya no existe en el nuevo mes (ej. 31 de
    // febrero) se recorta al último día válido en vez de producir una fecha
    // inválida.
    const maxDia = diasEnMes(indiceMes, numeroAnio);
    if (numeroDia > maxDia) numeroDia = maxDia;

    setDia(String(numeroDia).padStart(2, "0"));
    setMes(nuevoMes);
    setAnio(nuevoAnio);

    // Ajuste a 1 (spec_ajustes_pantalla_registro_limites_campos.md, 2026-10-20): este componente
    // YA NO calcula ni muestra su propio aviso de edad -- antes duplicaba, con la hora LOCAL del
    // dispositivo, el mismo chequeo que validarDatosRegistro() hace con la hora de Madrid (la
    // única fuente de verdad real). Queda un solo mensaje, el de RegistroScreen.tsx
    // (registro.edadMinima). onCambiar() se llama SIEMPRE, sin que ningún aviso de acá decida si
    // se puede enviar el formulario.
    const fechaIso = `${numeroAnio}-${String(indiceMes + 1).padStart(2, "0")}-${String(numeroDia).padStart(2, "0")}`;
    onCambiar(fechaIso);
  }

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <View style={estilos.fila}>
        <View style={estilos.columnaDia}>
          <SelectorDesplegable
            etiqueta=""
            placeholder={t("selectorFecha.dia")}
            valor={dia}
            opciones={diasDisponibles}
            onSeleccionar={(nuevoDia) => manejarSeleccion(nuevoDia, mes, anio)}
          />
        </View>
        <View style={estilos.columnaMes}>
          <SelectorDesplegable
            etiqueta=""
            placeholder={t("selectorFecha.mes")}
            valor={mes}
            opciones={MESES}
            onSeleccionar={(nuevoMes) => manejarSeleccion(dia, nuevoMes, anio)}
          />
        </View>
        <View style={estilos.columnaAnio}>
          {/* Con edadMinima=18 (el caso real, registro de choferes), esto son
              ~82 años (anioActual-100 a anioActual-18) — muy por encima de
              "un puñado", a diferencia de día (31) y mes (12), que quedan
              con SelectorDesplegable por ser listas cortas de interacción
              convencional por scroll (ver spec de SelectorBuscable). */}
          <SelectorBuscable
            etiqueta=""
            placeholder={t("selectorFecha.anio")}
            valor={anio}
            opciones={aniosDisponibles}
            obtenerEtiqueta={(item) => item}
            onSeleccionar={(nuevoAnio) => manejarSeleccion(dia, mes, nuevoAnio)}
          />
        </View>
      </View>

      {valor ? (
        <Text style={estilos.textoConfirmacion}>
          {t("selectorFecha.fechaSeleccionada", {
            fecha: `${dia}/${String((mesIndice ?? 0) + 1).padStart(2, "0")}/${anio}`,
          })}
        </Text>
      ) : null}
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
  fila: {
    flexDirection: "row",
    gap: espaciado.sm,
  },
  columnaDia: {
    flex: 1,
  },
  columnaMes: {
    flex: 1.4,
  },
  columnaAnio: {
    flex: 1.1,
  },
  textoConfirmacion: {
    ...tipografia.ayuda,
    color: colores.exito,
    marginTop: -espaciado.xs,
  },
});
