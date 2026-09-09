# Dashboard — app-transp

Panel administrativo (Next.js 16, App Router) para ver la flota en un mapa en vivo, revisar
jornadas con sus fotos, corregir datos con auditoría, y exportar reportes en Excel. Ver la guía
completa del monorepo en [`../README.md`](../README.md) y la referencia técnica exhaustiva en
[`../contexto_proyecto.md`](../contexto_proyecto.md).

## Arranque local

```bash
npm install
cp .env.example .env.local    # completá las variables, ver ../README.md §3
npm run dev                    # http://localhost:3000
```

## Rutas

| Ruta        | Qué hace                                                                   |
| ----------- | -------------------------------------------------------------------------- |
| `/login`    | Contraseña única de administrador                                          |
| `/mapa`     | Flota en vivo (Leaflet), polling cada 8s                                   |
| `/jornadas` | Tabla filtrable, detalle con fotos, corrección con auditoría, export Excel |

## Stack

Next.js App Router · TypeScript · Tailwind CSS v4 · componentes UI propios en `components/ui/`
(sin Radix, sin CLI de shadcn) · TanStack Query · `react-leaflet` · Supabase (`service_role` key
del lado del servidor, `anon` key sin usar todavía del lado del cliente).

## Verificación

```bash
npx tsc --noEmit && npm run lint && npm run format:check
```
