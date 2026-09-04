import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
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

function calcularEdad(anio: number, mesIndice: number, dia: number): number {
  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  const aunNoCumpleEsteAnio =
    hoy.getMonth() < mesIndice || (hoy.getMonth() === mesIndice && hoy.getDate() < dia);
  if (aunNoCumpleEsteAnio) edad -= 1;
  return edad;
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
  const [error, setError] = useState<string | null>(null);

  const mesIndice = mes ? MESES.indexOf(mes) : null;
  const diasDisponibles = useMemo(() => {
    const totalDias = mesIndice !== null && anio ? diasEnMes(mesIndice, Number(anio)) : 31;
    return Array.from({ length: totalDias }, (_, i) => String(i + 1).padStart(2, "0"));
  }, [mesIndice, anio]);

  function manejarSeleccion(nuevoDia: string | null, nuevoMes: string | null, nuevoAnio: string | null) {
    setError(null);

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

    const edad = calcularEdad(numeroAnio, indiceMes, numeroDia);
    if (edad < edadMinima) {
      setError(t("selectorFecha.errorEdadMinima", { edad: edadMinima }));
      return;
    }

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
          <SelectorDesplegable
            etiqueta=""
            placeholder={t("selectorFecha.anio")}
            valor={anio}
            opciones={aniosDisponibles}
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

      {error ? <Text style={estilos.textoError}>{error}</Text> : null}
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
  textoError: {
    ...tipografia.ayuda,
    color: colores.peligro,
    marginTop: -espaciado.xs,
  },
});
