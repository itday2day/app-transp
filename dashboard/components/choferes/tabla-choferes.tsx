"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { nombreApellidosChofer } from "@/lib/choferes";
import { useEmpresas } from "@/lib/hooks/use-empresas";
import { useRutas } from "@/lib/hooks/use-rutas";
import { cn, formatFecha } from "@/lib/utils";
import type { ChoferRow, EmpresaRow, EstadoChoferAuth, RutaRow } from "@/lib/types";

interface TablaChoferesProps {
  choferes: ChoferRow[];
  /** Email/email_confirmed_at (auth.users) + revisado_at ya resuelto por id -- viene de
   * listar_estado_choferes() (criterio 21), se busca por id una vez acá, no en cada fila. */
  estadoPorId: Map<string, EstadoChoferAuth>;
  cargando: boolean;
  onSeleccionar: (chofer: ChoferRow) => void;
  onRevisado: (chofer: ChoferRow) => void;
  onAnulado: (choferId: string) => void;
}

// spec_dashboard_choferes_limpieza.md, criterio 1: Nombre y apellidos -> DNI -> Teléfono ->
// Correo -> Empresa/ruta por defecto -> Alta -> Estado -> acciones. Se quitan "N.º empleado" y
// "País".
const COLUMNAS = [
  "Nombre y apellidos",
  "DNI",
  "Teléfono",
  "Correo",
  "Empresa / ruta",
  "Alta",
  "Estado",
  "",
];

/** Nombre de la empresa y/o ruta por defecto del chofer, resueltos por id contra los catálogos ya
 * cacheados por useEmpresas()/useRutas() -- nunca una consulta por fila. Si la empresa está
 * inactiva se muestra igual su nombre (criterio 4); "—" si no tiene ninguna de las dos. */
function textoEmpresaRuta(
  chofer: ChoferRow,
  empresaPorId: Map<string, EmpresaRow>,
  rutaPorId: Map<string, RutaRow>
): string {
  const empresa = chofer.empresa_defecto_id
    ? empresaPorId.get(chofer.empresa_defecto_id)
    : undefined;
  const ruta = chofer.ruta_defecto_id ? rutaPorId.get(chofer.ruta_defecto_id) : undefined;
  if (empresa && ruta) return `${empresa.nombre} / ${ruta.nombre}`;
  return empresa?.nombre ?? ruta?.nombre ?? "—";
}

function EstadoBadge({ chofer }: { chofer: ChoferRow }) {
  return (
    <Badge variant={chofer.activo ? "primary" : "default"}>
      {chofer.activo ? "Activo" : "De baja"}
    </Badge>
  );
}

/** Botones "Marcar como revisado" / "Anular registro sin confirmar" (criterios 20/21) -- en su
 * propio componente para que cada uno maneje su propio estado de confirmación/envío sin
 * interferir con los demás, y para poder detener la propagación del click sin repetirla en cada
 * callsite (tabla y tarjeta). */
function AccionesEstado({
  chofer,
  estado,
  onRevisado,
  onAnulado,
}: {
  chofer: ChoferRow;
  estado: EstadoChoferAuth | undefined;
  onRevisado: (chofer: ChoferRow) => void;
  onAnulado: (choferId: string) => void;
}) {
  const [confirmandoAnular, setConfirmandoAnular] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sinRevisar = chofer.revisado_at === null;
  const sinConfirmar = estado ? estado.emailConfirmedAt === null : false;

  async function marcarRevisado(e: MouseEvent) {
    e.stopPropagation();
    setEnviando(true);
    try {
      const respuesta = await fetch("/api/choferes/revisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chofer.id }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (respuesta.ok) {
        onRevisado((cuerpo as { chofer: ChoferRow }).chofer);
      }
    } finally {
      setEnviando(false);
    }
  }

  async function anularRegistro(e: MouseEvent) {
    e.stopPropagation();
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/choferes/anular-registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chofer.id }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(
          cuerpo && typeof cuerpo === "object" && "mensaje" in cuerpo
            ? String((cuerpo as { mensaje: unknown }).mensaje)
            : "No se pudo anular el registro."
        );
        return;
      }
      onAnulado(chofer.id);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
      setConfirmandoAnular(false);
    }
  }

  if (!sinRevisar && !sinConfirmar) return null;

  return (
    <div className="flex flex-col items-start gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1">
        {sinRevisar && <Badge variant="warning">Nuevo — sin revisar</Badge>}
        {sinConfirmar && <Badge variant="default">Correo sin confirmar</Badge>}
      </div>

      {confirmandoAnular ? (
        <div className="flex flex-col gap-1">
          {/* Criterio 20, "mostrar antes de actuar": nombre, DNI y correo exactos, antes del
              borrado -- ya están en pantalla (nombre/DNI en esta misma fila, correo en el badge
              de arriba), así que repetirlos acá sería redundante; igual se muestra el correo
              completo para que quede a la vista en el momento exacto de confirmar. */}
          <p className="text-xs text-muted-foreground">
            Esto borra a {chofer.nombre} {chofer.apellidos} (DNI {chofer.dni}
            {estado ? `, ${estado.email}` : ""}) de Auth — su DNI y correo quedan libres para una
            invitación nueva.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmandoAnular(false);
              }}
            >
              No
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={anularRegistro}
              loading={enviando}
            >
              Sí, anular registro
            </Button>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      ) : (
        <div className="flex gap-2">
          {sinRevisar && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={marcarRevisado}
              loading={enviando}
            >
              Marcar como revisado
            </Button>
          )}
          {sinConfirmar && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmandoAnular(true);
              }}
            >
              Anular registro sin confirmar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaChofer({
  chofer,
  estado,
  empresaPorId,
  rutaPorId,
  cargando,
  onSeleccionar,
  onRevisado,
  onAnulado,
}: {
  chofer: ChoferRow;
  estado: EstadoChoferAuth | undefined;
  empresaPorId: Map<string, EmpresaRow>;
  rutaPorId: Map<string, RutaRow>;
  cargando: boolean;
  onSeleccionar: () => void;
  onRevisado: (chofer: ChoferRow) => void;
  onAnulado: (choferId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={onSeleccionar}
      className={cn(
        "flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left text-sm transition-colors hover:bg-muted",
        cargando && "opacity-60"
      )}
    >
      {/* Criterio 2: mismos datos que la tabla, con nombre y DNI arriba. */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{nombreApellidosChofer(chofer)}</p>
          <p className="font-mono text-xs text-muted-foreground">DNI: {chofer.dni}</p>
        </div>
        <EstadoBadge chofer={chofer} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {chofer.telefono && <span className="font-mono">Tel: {chofer.telefono}</span>}
        <span>{estado?.email ?? "—"}</span>
        <span>{textoEmpresaRuta(chofer, empresaPorId, rutaPorId)}</span>
        <span>Alta: {formatFecha(chofer.created_at)}</span>
      </div>

      {chofer.debe_cambiar_contrasena && (
        <Badge variant="warning">Debe cambiar la contraseña</Badge>
      )}

      <AccionesEstado
        chofer={chofer}
        estado={estado}
        onRevisado={onRevisado}
        onAnulado={onAnulado}
      />
    </button>
  );
}

export function TablaChoferes({
  choferes,
  estadoPorId,
  cargando,
  onSeleccionar,
  onRevisado,
  onAnulado,
}: TablaChoferesProps) {
  // Criterio 4: nombres resueltos desde los hooks existentes (no el id), sin una consulta por
  // fila -- react-query ya cachea /api/empresas y /api/rutas (los usan invitar-chofer-dialog.tsx
  // y los diálogos de jornadas).
  const { data: empresasResp } = useEmpresas();
  const { data: rutasResp } = useRutas();
  const empresaPorId = useMemo(
    () => new Map((empresasResp?.data ?? []).map((e) => [e.id, e])),
    [empresasResp]
  );
  const rutaPorId = useMemo(
    () => new Map((rutasResp?.data ?? []).map((r) => [r.id, r])),
    [rutasResp]
  );

  return (
    <>
      {/* Mismo criterio que TablaJornadas/TablaVehiculos: tabla desde `lg`, tarjetas por debajo. */}
      <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              {COLUMNAS.map((columna) => (
                <th key={columna} className="px-3 py-2 font-medium">
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {choferes.map((chofer) => (
              <tr
                key={chofer.id}
                onClick={() => onSeleccionar(chofer)}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-muted",
                  cargando && "opacity-60"
                )}
              >
                <td className="px-3 py-2">{nombreApellidosChofer(chofer)}</td>
                <td className="px-3 py-2 font-mono">{chofer.dni}</td>
                <td className="px-3 py-2 font-mono">{chofer.telefono ?? "—"}</td>
                <td className="px-3 py-2">{estadoPorId.get(chofer.id)?.email ?? "—"}</td>
                <td className="px-3 py-2">{textoEmpresaRuta(chofer, empresaPorId, rutaPorId)}</td>
                <td className="px-3 py-2">{formatFecha(chofer.created_at)}</td>
                <td className="px-3 py-2">
                  <EstadoBadge chofer={chofer} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {chofer.debe_cambiar_contrasena && <Badge variant="warning">Pendiente</Badge>}
                    <AccionesEstado
                      chofer={chofer}
                      estado={estadoPorId.get(chofer.id)}
                      onRevisado={onRevisado}
                      onAnulado={onAnulado}
                    />
                  </div>
                </td>
              </tr>
            ))}

            {!cargando && choferes.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNAS.length}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No hay choferes cargados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {choferes.map((chofer) => (
          <TarjetaChofer
            key={chofer.id}
            chofer={chofer}
            estado={estadoPorId.get(chofer.id)}
            empresaPorId={empresaPorId}
            rutaPorId={rutaPorId}
            cargando={cargando}
            onSeleccionar={() => onSeleccionar(chofer)}
            onRevisado={onRevisado}
            onAnulado={onAnulado}
          />
        ))}

        {!cargando && choferes.length === 0 && (
          <p className="rounded-lg border border-border px-3 py-10 text-center text-sm text-muted-foreground">
            No hay choferes cargados todavía.
          </p>
        )}
      </div>
    </>
  );
}
