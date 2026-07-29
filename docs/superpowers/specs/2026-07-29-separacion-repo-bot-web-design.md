# Separación de repos: bot de WhatsApp vs. web

## Contexto

Este repo (`rental-bot`) nació como el bot de WhatsApp (commit `3cf6e16`, 11/5,
"restructure repo root to rental-bot"): `src/`, `package.json`, etc. viven en la raíz.
La app web (`web/`, Next.js) se agregó después como carpeta anidada con su propio
`package.json`, y hoy es donde vive casi todo el desarrollo activo (cuenta-paola, gastos,
auth, calendario). El bot (`src/`) no se toca desde el 19/6.

Narci-bot (proyecto hermano, en producción desde el 21/7) ya prueba que este patrón de
deploy funciona bien: repo propio, carpeta propia en la VM (`~/narci-bot`), proceso PM2
propio, GitHub Actions con `deploy.yml` (scp + ssh + `pm2 restart`). El bot de rental-bot
no llegó a tener ese pipeline funcionando — `DEPLOY.md` lo describe pero no hay ningún
`.github/workflows/*.yml` en este repo hoy.

**Decisión de fondo** (confirmada por Mili): la identidad actual del repo (`rental-bot`,
remoto de GitHub, historial de commits) se la queda la **web**. El bot se extrae a un
repo nuevo, arrancando de cero (sin arrastrar historial — el historial viejo del bot
sigue disponible acá si hace falta consultar el porqué de algo).

**Fuera de alcance de este spec** (deliberado, ver "Próximo paso" más abajo):
- Migrar la persistencia del bot de Google Sheets a Supabase.
- Armar el pipeline de deploy (GitHub Actions + PM2) del bot en su repo nuevo.
- Decidir si el bot comparte número de WhatsApp / VM con narci-bot.

Este spec es solo la separación de código en dos repos. Los tres puntos de arriba son
cambios grandes con su propio diseño — se abordan en un brainstorm aparte, después de
ejecutar este.

## Estado final

Dos repos:

1. **`rental-bot`** (este repo, mismo remoto/nombre/historial) — la web. `web/` sube a
   la raíz.
2. **Repo nuevo** (nombre propuesto: `rental-bot-whatsapp` — a confirmar/ajustar antes de
   crear el remoto en GitHub) — el bot. Arranca con un commit inicial limpio, sin
   historial previo.

## Qué se mueve a dónde

### Se queda en `rental-bot` (sube de `web/` a la raíz)

Todo el contenido actual de `web/` (código Next.js, `package.json` propio, etc.), más lo
que ya está en la raíz y es de la web:

- `supabase/` — migraciones Postgres (el bot no las usa, usa Google Sheets hoy).
- `design-system/rental-bot-web/`, `design-system/temporalias/` — docs de diseño de
  páginas web.
- `QA_Calendario.xlsx` — QA de la feature Calendario (web).
- `scripts/pipeline-viewer.mjs` — herramienta del pipeline de agentes de features web.
- `.claude/` completo (`BUGS.md`, `STATUS.md`, `POLITICAS.md`, `PIPELINE.md`,
  `CONTEXT.md`, `commands/`, `skills/`, `artifacts/`) — el propio `CLAUDE.md` de este
  repo dice que ese pipeline es "para construir features nuevas en la web"; se queda acá
  con su historial completo, tal cual.
- `CLAUDE.md` actual (instrucciones del repo) — se actualiza para reflejar que el repo ya
  es 100% web (sin mención al bot).

### Se va al repo nuevo del bot (sin historial)

- `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js`,
  `jest.setup.js` — el proyecto Node del bot completo, tal cual.
- `scripts/diagnostico-sheets.js`, `scripts/generar-resumen.js`,
  `scripts/migrar-datos.js` (confirmado: es Sheets→Sheets, no toca Supabase),
  `scripts/setup/setup-sheets.js`.
- `docs/auditoria-casuisticas.md`, `docs/flujo-reservas.svg` — casuística de reservas del
  bot.
- `DEPLOY.md` — doc de deploy del bot (queda como referencia; el pipeline real de deploy
  no se arma en este spec, ver "Próximo paso").
- `railway.json` — config de deploy vieja (Railway/Nixpacks), probablemente muerta desde
  que se pasó a GCP VM. Se mueve igual, sin borrar — limpieza a decidir más adelante, no
  bloqueante acá.
- `CLAUDE.md` **nuevo**, chico, específico del bot (no una copia del de la web) — pedido
  explícito de Mili.

### Se borra

- `entrevista-paola` (archivo vacío en la raíz, sin uso) — ya borrado.

### No se mueve como parte de este spec (queda local, gitignored, sin decisión tomada)

`_archive/`, `comprobantes/`, `data/`, `coverage/`, `dist/`, `node_modules/` — ninguno
está trackeado en git hoy (confirmado contra `.gitignore`), así que no hay nada que mover
a nivel repo. `comprobantes/` en particular son archivos reales en disco (recibos
subidos) — quedan donde están hasta que se decida su destino junto con la migración a
Supabase.

## Mecánica de ejecución

1. **Repo del bot**: crear carpeta nueva (ej. `../rental-bot-whatsapp`), copiar ahí los
   archivos/carpetas de la lista "se va al repo nuevo", `git init`, un commit inicial.
   Escribir el `CLAUDE.md` nuevo del bot (contexto del proyecto, filosofía de código
   ponytail heredada del repo padre, sin el pipeline de features web).
   **No se crea remoto de GitHub ni se hace push** — eso lo hace Mili cuando esté lista
   (o lo pide explícitamente en otra sesión).
2. **Este repo (`rental-bot` → web)**:
   - `git mv web/<todo>` a la raíz (código + `.gitignore`, `.env.local` etc. propios de
     `web/` si los tuviera).
   - `git rm` de todo lo que se fue al repo del bot (`src/`, `package.json` raíz viejo,
     `jest.*`, `scripts/diagnostico-sheets.js`, etc. — la lista completa de arriba).
   - Ajustar `package.json`/`tsconfig.json`/etc. de la raíz para que sean los que hoy
     tiene `web/` (el proyecto Next.js pasa a ser el único proyecto Node del repo).
   - Actualizar `CLAUDE.md` de este repo: sacar cualquier referencia al bot que ya no
     aplique.
   - Un commit que documente el split.
3. Verificación: `npm install` + build (`tsc --noEmit` o `next build`) en ambos repos
   después de mover, para confirmar que ninguno quedó con imports rotos o dependencias
   faltantes.

## Riesgos / cosas a tener presente

- Vercel tiene "Root Directory = web" configurado para el deploy de la web (ver
  `STATUS.md`, sesión 2026-07-01). Al subir `web/` a la raíz de este repo, ese Root
  Directory en Vercel hay que cambiarlo a `.` (raíz) — si no, el deploy de producción se
  rompe. **Acción manual pendiente de Mili en el dashboard de Vercel**, no algo que se
  resuelva solo con el commit. Pasos concretos:

  1. Entrar a [vercel.com/dashboard](https://vercel.com/dashboard) → proyecto
     `temporalias` (el que sirve `temporalias.vercel.app`).
  2. **Settings → General → Root Directory** → tocar "Edit", borrar `web` para que quede
     vacío / `./` (raíz del repo), Save.
  3. **Settings → Environment Variables**: las variables actuales (`NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, etc.) no cambian de nombre ni valor — Vercel las
     inyecta igual sin importar el Root Directory, así que no hay que tocar nada acá.
     Verificar igual después del primer deploy que sigan apareciendo en el build log.
  4. Hacer el commit que sube `web/` a la raíz de este repo **y recién después** cambiar
     el Root Directory (o al revés, cambiarlo primero) — el orden no importa en sí, pero
     **no dejar pasar tiempo entre las dos cosas**: mientras el código ya esté en la raíz
     y Vercel todavía apunte a `web/` (o viceversa), el próximo deploy automático va a
     fallar (no va a encontrar `package.json` donde Vercel lo busca).
  5. Confirmar con un deploy manual ("Redeploy" en la pestaña Deployments, sin cache) que
     el build corre bien antes de dar por cerrado el punto — no esperar al próximo push
     para enterarse si quedó mal.
- El bot no tiene pipeline de deploy funcionando hoy (no hay `.github/workflows` en este
  repo pese a lo que dice `DEPLOY.md`) — el repo nuevo tampoco lo va a tener hasta el
  próximo spec. Mientras tanto, el bot no se puede desplegar solo moviendo código; sigue
  sin infraestructura propia funcionando.

## Próximo paso (spec aparte, no este)

Brainstorm dedicado a migrar el bot de Google Sheets a Supabase: los handlers
(`income.ts`, `cash.ts`, `gastos.ts`, `reservas.ts`, `comision.ts`, `balance.ts`) deben
escribir directo en las tablas `reservas`/`ingresos`/`gastos`/`movimientos_internos` que
ya usa la web, actuando como canal alternativo a la carga de comprobantes — con sus
propias preguntas de diseño: cómo se autentica el bot contra Supabase (hoy no hay
Supabase Auth por número de teléfono, es un service role key igual que
`/api/cuenta-paola-data`), mapeo de campos entre lo que hoy arma el bot para Sheets y el
esquema real de Supabase, y qué pasa si el mismo gasto/ingreso se carga por los dos
canales (web y bot) casi al mismo tiempo.
