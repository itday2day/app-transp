import React from "react";
import { PAISES } from "@/data/paises";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { Pais } from "@/types";

interface Props {
  etiqueta: string;
  placeholder: string;
  valor: string | null;
  onSeleccionar: (nombrePais: string) => void;
}

// Wrapper fino sobre SelectorBuscable — mismo criterio que ya usa
// SelectorMatricula.tsx sobre SelectorDesplegable: fija la lista de países y
// mantiene el contrato de datos existente (RegistroScreen sigue mandando y
// recibiendo el nombre del país como string, no el objeto Pais completo).
export function SelectorPais({ etiqueta, placeholder, valor, onSeleccionar }: Props) {
  const paisSeleccionado = valor ? (PAISES.find((pais) => pais.nombre === valor) ?? null) : null;

  return (
    <SelectorBuscable<Pais>
      etiqueta={etiqueta}
      placeholder={placeholder}
      valor={paisSeleccionado}
      opciones={PAISES}
      obtenerEtiqueta={(pais) => pais.nombre}
      obtenerClave={(pais) => pais.codigo}
      onSeleccionar={(pais) => onSeleccionar(pais.nombre)}
    />
  );
}
