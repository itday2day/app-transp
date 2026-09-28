-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v11, en el SQL Editor.
-- spec_incidencia_en_checkin.md: agrega la misma incidencia estructurada que ya tiene el
-- check-out (tipo + detalle + fotos) al check-in. Columnas nuevas, con sufijo "_checkin" — no se
-- toca ninguna de las columnas existentes de la incidencia de check-out (mismo criterio que el
-- resto del proyecto usa para todo lo que existe en dos momentos de la jornada: km_inicial/
-- km_final, combustible_inicial/combustible_final).
--
-- La columna `incidencias` (texto libre, la que capturaba el check-in antes de este spec) NO se
-- toca ni se borra — queda de solo lectura para las jornadas ya cargadas. Ver contexto_proyecto.md
-- y spec_incidencia_en_checkin.md §4 para el criterio de no migrar ese texto a estos campos nuevos.

alter table public.jornadas
  add column tuvo_incidencia_checkin boolean,
  add column tipo_incidencia_checkin text
    check (tipo_incidencia_checkin in ('Avería vehículo', 'Tráfico/Retraso', 'Cliente ausente', 'Otro')),
  add column detalle_incidencia_checkin text,
  add column fotos_incidencia_checkin text[];

-- ⚠️ No se agrega ninguna de estas 4 columnas a `jornadas_proteger_correcciones_admin()`
-- (schema_v10_correccion_admin_gana.sql) a propósito: el Dashboard no gana, en este spec, ninguna
-- forma de editar/completar remotamente la incidencia de check-in (fuera de alcance, ver
-- spec_incidencia_en_checkin.md §6) — a diferencia de la incidencia de check-out, que sí puede
-- llegar por "cerrar jornada" desde el Dashboard (Hallazgo #6).
