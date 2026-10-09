-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v17, en el SQL Editor.
-- spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50), Pedido 4: el check-in ofrece sus
-- propios tipos de incidencia (pensados para la carga, no para la ruta) en vez de los 4 que
-- `schema_v12_incidencia_checkin.sql` le copió del check-out. `Avería vehículo` y `Otro` se
-- reutilizan (misma etiqueta en la base, etiqueta de pantalla distinta solo en el check-in) --
-- nunca dos valores para la misma idea en los reportes.
--
-- Solo aditiva: las 4 filas históricas que usan 'Tráfico/Retraso'/'Cliente ausente' en el check-in
-- siguen siendo válidas -- se quitan de la LISTA QUE SE OFRECE en la app (criterio 12 de la spec),
-- no del CHECK, porque endurecerlo invalidaría esas filas y haría fallar la sincronización de
-- cualquier dev build viejo que todavía los mande. El `CHECK` del check-out
-- (`jornadas_tipo_incidencia_check`) no se toca.
alter table public.jornadas
  drop constraint jornadas_tipo_incidencia_checkin_check;

alter table public.jornadas
  add constraint jornadas_tipo_incidencia_checkin_check
  check (
    tipo_incidencia_checkin in (
      'Avería vehículo',
      'Tráfico/Retraso',
      'Cliente ausente',
      'Otro',
      'Mercancía dañada',
      'Faltante/Sobrante',
      'Temperatura fuera de rango',
      'Pedido/Documentación'
    )
  );
