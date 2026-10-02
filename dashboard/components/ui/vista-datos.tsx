/** spec_modo_ver_editar_chofer_flota.md: lista de pares etiqueta/valor en texto plano, sin bordes
 * de formulario ni inputs — el modo "Ver" de ChoferDialog y VehiculoDialog, compartido desde el
 * primer uso porque tiene dos casos reales desde el día uno (no es generalizar antes de tiempo).
 * Visualmente distinto a propósito del modo edición, para que no haya forma de confundir en qué
 * modo está el diálogo. */
export interface CampoVista {
  etiqueta: string;
  valor: string;
}

export function VistaDatos({ campos }: { campos: CampoVista[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
      {campos.map((campo) => (
        <div key={campo.etiqueta}>
          <dt className="text-xs text-muted-foreground">{campo.etiqueta}</dt>
          <dd className="text-sm font-medium">{campo.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
