"use client";

import { useState, type MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChoferRow, EstadoChoferAuth } from "@/lib/types";

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

const COLUMNAS = ["N.º empleado", "Nombre", "DNI", "País", "Teléfono", "Estado", ""];

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
  cargando,
  onSeleccionar,
  onRevisado,
  onAnulado,
}: {
  chofer: ChoferRow;
  estado: EstadoChoferAuth | undefined;
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
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {chofer.nombre} {chofer.apellidos}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {chofer.numero_empleado ? `N.º ${chofer.numero_empleado}` : "Registrado por invitación"}
          </p>
        </div>
        <EstadoBadge chofer={chofer} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">DNI: {chofer.dni}</span>
        {chofer.pais_nacimiento && <span>{chofer.pais_nacimiento}</span>}
        {chofer.telefono && <span className="font-mono">Tel: {chofer.telefono}</span>}
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
                <td className="px-3 py-2 font-mono font-medium">{chofer.numero_empleado ?? "—"}</td>
                <td className="px-3 py-2">
                  {chofer.nombre} {chofer.apellidos}
                </td>
                <td className="px-3 py-2 font-mono">{chofer.dni}</td>
                <td className="px-3 py-2">{chofer.pais_nacimiento ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{chofer.telefono ?? "—"}</td>
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
