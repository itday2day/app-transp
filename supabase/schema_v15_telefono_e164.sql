-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v14, en el SQL Editor. Resuelve
-- spec_telefono_e164_y_pais_desplegable.md: endurece el formato del teléfono agregado en el
-- Hallazgo #34 ("sin formato particular") a E.164.

-- Confirmado contra la base real antes de esta migración (Fase 1 punto 6 de la spec): las 5 filas
-- de choferes tienen telefono = null (nadie cargó uno todavía) — a diferencia del DNI/matrícula
-- del Hallazgo #34, acá no hace falta NOT VALID: el CHECK se puede agregar validado de entrada
-- contra los datos reales, sin excepciones para filas legado.
alter table public.choferes
  add constraint choferes_telefono_formato
  check (telefono is null or telefono ~ '^\+[1-9]\d{7,14}$');
