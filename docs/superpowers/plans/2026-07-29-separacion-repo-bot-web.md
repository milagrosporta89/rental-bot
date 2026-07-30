# Separación de repos: bot de WhatsApp vs. web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar este repo (hoy bot en la raíz + web anidada) en dos repos independientes: este mismo repo (`rental-bot`, mismo remoto/historial) se queda solo con la web (`web/` sube a la raíz); el bot de WhatsApp (`src/` y todo lo relacionado) se extrae a un repo nuevo (`rental-bot-whatsapp`), arrancando de cero sin historial previo.

**Architecture:** Ningún cambio de código de negocio — es puro movimiento de archivos entre dos árboles de trabajo git, más la fusión de un par de archivos de configuración (`CLAUDE.md`/`AGENTS.md`, `.gitignore`) que hoy existen en ambos lados con contenido distinto. Cada paso termina con una verificación (`npm install` + `tsc --noEmit` / build) para confirmar que ninguno de los dos proyectos quedó roto.

**Tech Stack:** Node.js/TypeScript (bot, Express + Google Sheets API), Next.js/TypeScript (web, Supabase). Sin dependencias nuevas.

## Global Constraints

- No crear remoto de GitHub para el repo nuevo del bot ni hacer `git push` — el repo queda solo local hasta que Mili lo pida explícitamente en otra sesión.
- El repo nuevo del bot arranca con **un solo commit inicial**, sin arrastrar el historial de este repo (decisión ya tomada en el spec).
- `.claude/` completo (con su historial), `CLAUDE.md`, `docs/superpowers/` (specs y plans, incluido este mismo plan) se quedan en este repo — no se copian al repo del bot.
- No tocar `_archive/`, `comprobantes/`, `data/`, `coverage/`, `dist/`, `node_modules/`: no están trackeados en git hoy, no forman parte de este split.
- **Nunca imprimir en la terminal ni en ningún commit el contenido de archivos `.env*`** — solo copiarlos/moverlos como archivos opacos (`cp`/`mv`), nunca `cat`.
- Nombre del repo nuevo confirmado por Mili: `rental-bot-whatsapp`, creado como carpeta hermana: `c:/Users/Administrador/Milagros/rental-bot-whatsapp`.
- Spec de referencia: `docs/superpowers/specs/2026-07-29-separacion-repo-bot-web-design.md` — cualquier duda sobre qué-va-dónde se resuelve ahí, no se re-decide acá.

---

### Task 1: Crear el repo nuevo del bot con el código completo

**Files:**
- Create (repo nuevo): `c:/Users/Administrador/Milagros/rental-bot-whatsapp/` — copia exacta de:
  - `src/` completo (incluye `src/__tests__/`)
  - `package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js`, `jest.setup.js`
  - `scripts/diagnostico-sheets.js`, `scripts/generar-resumen.js`, `scripts/migrar-datos.js`, `scripts/setup/setup-sheets.js`
  - `docs/auditoria-casuisticas.md`, `docs/flujo-reservas.svg`
  - `DEPLOY.md`, `railway.json`
  - `.env` (real, untracked — copiar como archivo opaco)

**Interfaces:** Ninguna — este task no modifica el repo `rental-bot` todavía, solo crea el repo nuevo al lado. Task 4 depende de que este task haya terminado y verificado (Task 3) antes de borrar nada acá.

- [ ] **Step 1: Crear la carpeta del repo nuevo y copiar el árbol de archivos**

```bash
mkdir -p "/c/Users/Administrador/Milagros/rental-bot-whatsapp"
cd "/c/Users/Administrador/Milagros/rental-bot"

cp -r src "/c/Users/Administrador/Milagros/rental-bot-whatsapp/"
mkdir -p "/c/Users/Administrador/Milagros/rental-bot-whatsapp/scripts/setup"
cp scripts/diagnostico-sheets.js scripts/generar-resumen.js scripts/migrar-datos.js \
   "/c/Users/Administrador/Milagros/rental-bot-whatsapp/scripts/"
cp scripts/setup/setup-sheets.js "/c/Users/Administrador/Milagros/rental-bot-whatsapp/scripts/setup/"

mkdir -p "/c/Users/Administrador/Milagros/rental-bot-whatsapp/docs"
cp docs/auditoria-casuisticas.md docs/flujo-reservas.svg \
   "/c/Users/Administrador/Milagros/rental-bot-whatsapp/docs/"

cp package.json package-lock.json tsconfig.json jest.config.js jest.setup.js DEPLOY.md railway.json \
   "/c/Users/Administrador/Milagros/rental-bot-whatsapp/"
```

- [ ] **Step 2: Copiar el `.env` real (sin mostrar su contenido)**

```bash
cp "/c/Users/Administrador/Milagros/rental-bot/.env" "/c/Users/Administrador/Milagros/rental-bot-whatsapp/.env"
```

- [ ] **Step 3: Verificar que se copió todo antes de seguir**

Run:
```bash
find "/c/Users/Administrador/Milagros/rental-bot-whatsapp" -maxdepth 2 | sort
```
Expected: se ven `src/`, `scripts/`, `docs/`, `package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js`, `jest.setup.js`, `DEPLOY.md`, `railway.json`, `.env`. Si falta alguno, repetir el `cp` correspondiente antes de continuar — no seguir al Step 4 con archivos faltantes.

- [ ] **Step 4: `.gitignore` del repo nuevo**

```bash
cat > "/c/Users/Administrador/Milagros/rental-bot-whatsapp/.gitignore" << 'EOF'
node_modules/
dist/
.env
*.js.map
coverage/
EOF
```

- [ ] **Step 5: `git init` y commit inicial**

```bash
cd "/c/Users/Administrador/Milagros/rental-bot-whatsapp"
git init
git add -A
git commit -m "feat: extraer bot de WhatsApp de rental-bot a repo propio

Código movido tal cual desde rental-bot (sin historial previo, decisión
explícita de Mili — el historial viejo sigue disponible en el repo web).
Ver docs/superpowers/specs/2026-07-29-separacion-repo-bot-web-design.md
en el repo rental-bot para el contexto completo del split.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Expected: commit creado, `git log --oneline` muestra un único commit. `git status` muestra working tree limpio (el `.env` queda sin trackear, tapado por `.gitignore`).

---

### Task 2: Escribir `CLAUDE.md` nuevo para el repo del bot

**Files:**
- Create: `c:/Users/Administrador/Milagros/rental-bot-whatsapp/CLAUDE.md`

**Interfaces:** Ninguna — archivo de documentación, no afecta código.

- [ ] **Step 1: Escribir el archivo**

Contenido exacto:

```markdown
# rental-bot-whatsapp – instrucciones para el agente

Bot de WhatsApp (Cloud API de Meta) para gestión operativa de alquileres
temporarios: registro de gastos, ingresos y reservas por chat, con OCR de
comprobantes. Extraído de `rental-bot` el 2026-07-29 — ese repo ahora es
solo la web (Next.js), y conserva el historial de commits de este código
hasta la fecha del split.

## Filosofía de código (ponytail)

Sos un senior developer eficiente. El mejor código es el que nunca se escribe.

Antes de escribir cualquier código, parate en el primer escalón que aguante:

1. **¿Necesita existir?** (YAGNI — si nadie lo pidió, no lo hagas)
2. **¿Lo hace la stdlib de Node/TypeScript?** Usala.
3. **¿Lo cubre una feature nativa de la plataforma?** Usala.
4. **¿Lo resuelve una dependencia ya instalada?** Usala.
5. **¿Puede ser una línea?** Hacela una línea.
6. Solo entonces: escribí el mínimo código que funciona.

Reglas:

- Sin abstracciones que no fueron pedidas explícitamente.
- Sin dependencias nuevas si se puede evitar.
- Sin boilerplate que nadie pidió.
- Borrar > agregar. Aburrido > ingenioso. La menor cantidad de archivos posible.
- Si un cambio es complejo, preguntá: "¿Realmente necesitás X, o Y ya lo cubre?"

No aplica pereza en: validación en los límites de confianza (input del usuario,
webhooks de Meta), manejo de errores que previenen pérdida de datos, seguridad.

## Estado del deploy

`DEPLOY.md` describe un deploy a una VM de GCP vía PM2 + GitHub Actions, pero
ese pipeline (`.github/workflows/*.yml`) todavía no existe en este repo —
es el próximo trabajo pendiente, junto con decidir si este bot comparte
número de WhatsApp / VM con `narci-bot` (proyecto hermano, mismo patrón de
deploy, ya en producción).

## Persistencia (en transición)

Hoy usa Google Sheets (`src/services/sheets.ts`) para todo. Hay una migración
planeada (todavía sin diseñar) para que gastos y reservas escriban directo en
las mismas tablas Supabase que usa la web (`reservas`, `ingresos`, `gastos`,
`movimientos_internos`), actuando como canal alternativo a la carga manual de
comprobantes en la web. No asumas que ya está hecho — confirmar contra
`src/services/` antes de tocar nada relacionado.

## Tests

`npm test` corre Jest. A la fecha del split, `src/__tests__/reservas.test.ts`
tiene ~38/123 tests rotos por lógica de saldo/pago desactualizada (deuda de
tests preexistente, no relacionada con el split) — no es una regresión nueva
si siguen fallando exactamente esos.
```

- [ ] **Step 2: Commit**

```bash
cd "/c/Users/Administrador/Milagros/rental-bot-whatsapp"
git add CLAUDE.md
git commit -m "docs: agregar CLAUDE.md propio del repo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Verificar que el repo del bot compila y testea de forma standalone

**Files:** ninguno nuevo — solo verificación sobre lo creado en Task 1-2.

**Interfaces:** Ninguna.

- [ ] **Step 1: Instalar dependencias**

```bash
cd "/c/Users/Administrador/Milagros/rental-bot-whatsapp"
npm install
```
Expected: termina sin errores (warnings de deprecation son aceptables).

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: sin salida (0 errores).

- [ ] **Step 3: Tests**

```bash
npm test
```
Expected: la mayoría de los tests de `income.test.ts` (si existe), `setup.test.ts`, `helpers/ctx.ts` pasan. En `reservas.test.ts` es esperable ver ~38 de 123 fallando — **eso es deuda preexistente, no algo que este task deba arreglar**. Si el número de tests rotos es sustancialmente distinto (muchos más fallando, o fallando en archivos que antes pasaban), ahí sí hay que investigar si algo se rompió en la copia antes de seguir al Task 4.

- [ ] **Step 4: Confirmar que el bot arranca**

```bash
cp .env.example .env 2>/dev/null; npm run build && node -e "require('dotenv').config(); console.log('build OK, dist/index.js existe:', require('fs').existsSync('dist/index.js'))"
```
Expected: `build OK, dist/index.js existe: true`. (No hace falta levantar el servidor real ni tener credenciales válidas de Meta/Google para este chequeo — solo confirmar que compila a `dist/` y el entrypoint existe.)

---

### Task 4: Sacar del repo `rental-bot` todo lo que ya vive en el repo del bot

**Files:**
- Delete (de este repo, `rental-bot`): `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js`, `jest.setup.js`, `scripts/diagnostico-sheets.js`, `scripts/generar-resumen.js`, `scripts/migrar-datos.js`, `scripts/setup/setup-sheets.js`, `docs/auditoria-casuisticas.md`, `docs/flujo-reservas.svg`, `DEPLOY.md`, `railway.json`
- Delete (untracked): `.env` (raíz) — solo después de confirmar que ya existe su copia en el repo del bot (Task 1, Step 2/3).

**Interfaces:** Ninguna — a partir de este punto el repo `rental-bot` deja de tener un proyecto Node en la raíz (hasta el Task 5, que trae el de `web/`).

- [ ] **Step 1: Confirmar que Task 1-3 están OK antes de borrar nada acá**

Run: `test -f "/c/Users/Administrador/Milagros/rental-bot-whatsapp/.env" && test -d "/c/Users/Administrador/Milagros/rental-bot-whatsapp/src" && echo "OK para continuar"`
Expected: `OK para continuar`. Si no, volver al Task 1 — no seguir con el `git rm` de acá sin esto confirmado (es la única copia de las credenciales del bot).

- [ ] **Step 2: `git rm` de todo lo que ya está en el repo nuevo**

```bash
cd "/c/Users/Administrador/Milagros/rental-bot"
git rm -r src
git rm package.json package-lock.json tsconfig.json jest.config.js jest.setup.js
git rm scripts/diagnostico-sheets.js scripts/generar-resumen.js scripts/migrar-datos.js scripts/setup/setup-sheets.js
git rm docs/auditoria-casuisticas.md docs/flujo-reservas.svg
git rm DEPLOY.md railway.json
```

- [ ] **Step 3: Borrar el `.env` real de la raíz (ya no hace falta acá)**

```bash
rm "/c/Users/Administrador/Milagros/rental-bot/.env"
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: sacar el bot de WhatsApp de este repo

Movido a rental-bot-whatsapp (repo nuevo, local, sin remoto todavía).
Ver docs/superpowers/specs/2026-07-29-separacion-repo-bot-web-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Expected: `git status` no muestra ninguno de los archivos borrados como pendiente; `ls scripts/` en este repo solo muestra `pipeline-viewer.mjs` (y la carpeta `setup/` queda vacía — borrarla: `rmdir scripts/setup` si `git rm` la dejó vacía en el working tree).

---

### Task 5: Subir `web/` a la raíz de `rental-bot`

**Files:**
- Move (tracked, `git mv`): todos los archivos listados abajo, de `web/<path>` a `<path>`.
- Move (untracked, `mv` de filesystem — **nunca mostrar su contenido**): `web/.env.local`, `web/.env.prod.local`, `web/.env.staging.local`.

**Interfaces:** Ninguna — movimiento de archivos, sin cambios de código.

- [ ] **Step 1: Mover el código y config trackeados con `git mv`**

```bash
cd "/c/Users/Administrador/Milagros/rental-bot"

git mv web/README.md README.md
git mv web/AGENTS.md AGENTS.md
git mv web/components.json components.json
git mv web/eslint.config.mjs eslint.config.mjs
git mv web/next.config.ts next.config.ts
git mv web/package.json package.json
git mv web/package-lock.json package-lock.json
git mv web/postcss.config.mjs postcss.config.mjs
git mv web/tsconfig.json tsconfig.json
git mv web/public public
git mv web/src src

git rm web/CLAUDE.md
git rm web/.gitignore
```

(`web/CLAUDE.md` solo tenía una línea, `@AGENTS.md` — se resuelve en el Task 6 fusionándolo con el `CLAUDE.md` que ya existe en la raíz. `web/.gitignore` se reemplaza por una versión fusionada en el Task 6 también.)

- [ ] **Step 2: Mover los archivos de entorno reales (untracked, filesystem plano)**

```bash
mv web/.env.local .env.local
mv web/.env.prod.local .env.prod.local
mv web/.env.staging.local .env.staging.local
```

- [ ] **Step 3: Confirmar que no quedó nada de valor adentro de `web/` antes de borrarla**

Run: `find web -type f 2>/dev/null`
Expected: sin salida, o solo archivos regenerables (`node_modules/`, `.next/`, `coverage/` si existieran — nada con extensión de código fuente, config o `.env*`). Si aparece algo inesperado, moverlo a mano a su lugar correspondiente en la raíz antes de continuar.

- [ ] **Step 4: Borrar la carpeta `web/` vacía (o con solo restos regenerables)**

```bash
rm -rf web
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: subir web/ a la raíz del repo

Este repo (rental-bot) pasa a ser solo la app web — el bot se extrajo a
rental-bot-whatsapp (repo aparte). Ver
docs/superpowers/specs/2026-07-29-separacion-repo-bot-web-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Fusionar `CLAUDE.md`/`AGENTS.md` y `.gitignore` de la raíz

**Files:**
- Modify: `CLAUDE.md` (raíz) — agregar referencia a `AGENTS.md`.
- Create: `.gitignore` (raíz) — reemplazar contenido por el de Next.js (el que tenía `web/.gitignore`).

**Interfaces:** Ninguna.

- [ ] **Step 1: Agregar la referencia a `AGENTS.md` en el `CLAUDE.md` de la raíz**

El `CLAUDE.md` de la raíz hoy empieza así:

```markdown
# rental-bot – instrucciones para el agente

## Filosofía de código (ponytail)
```

Insertar una línea nueva entre el título y la primera sección, para que quede:

```markdown
# rental-bot – instrucciones para el agente

@AGENTS.md

## Filosofía de código (ponytail)
```

(Esa línea hace que Claude Code cargue `AGENTS.md` — el aviso de "esta no es la versión de Next.js que conocés" — automáticamente, igual que antes lo hacía `web/CLAUDE.md` con su único contenido `@AGENTS.md`.)

- [ ] **Step 2: Reemplazar el `.gitignore` de la raíz**

Contenido nuevo completo (reemplaza el archivo entero — el viejo tenía entradas específicas del bot que ya no aplican: `dist/`, `_archive/`, `QA_rental_bot.xlsx`, `comprobantes/`, `data/`):

```
# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/Administrador/Milagros/rental-bot"
git add CLAUDE.md .gitignore
git commit -m "chore: fusionar CLAUDE.md/AGENTS.md y .gitignore tras subir web/ a la raíz

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Verificar que el repo (ahora solo web) instala y buildea desde la raíz

**Files:** ninguno nuevo — verificación sobre Task 5-6.

- [ ] **Step 1: Instalar dependencias desde la raíz**

```bash
cd "/c/Users/Administrador/Milagros/rental-bot"
npm install
```
Expected: termina sin errores.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: sin salida (0 errores).

- [ ] **Step 3: Build de Next.js**

```bash
npm run build
```
Expected: `Compiled successfully` (o equivalente de la versión de Next.js instalada), sin errores de rutas rotas ni módulos faltantes.

- [ ] **Step 4: Lint**

```bash
npm run lint
```
Expected: sin errores (warnings preexistentes, si los hubiera, no son un bloqueo nuevo introducido por el split).

- [ ] **Step 5: Confirmar en un navegador real que el dev server levanta**

```bash
npm run dev
```
Abrir `http://localhost:3000` (o el puerto que indique la consola), confirmar que carga el login sin errores en consola del navegador. Parar el server (`Ctrl+C`) al terminar de confirmar.

---

### Task 8: Checklist final (no automatizable) y cierre

**Files:** ninguno.

- [ ] **Step 1: Confirmar estado final de ambos repos**

```bash
echo "=== rental-bot (web) ===" && cd "/c/Users/Administrador/Milagros/rental-bot" && git log --oneline -5 && git status
echo "=== rental-bot-whatsapp (bot) ===" && cd "/c/Users/Administrador/Milagros/rental-bot-whatsapp" && git log --oneline -5 && git status
```
Expected: ambos con working tree limpio, cada uno con su propio historial (rental-bot con todo el historial viejo + los commits de este plan; rental-bot-whatsapp con 2 commits, los de Task 1 y 2).

- [ ] **Step 2: Avisar a Mili el checklist manual pendiente** (no se resuelve con código):
  - Cambiar el **Root Directory** del proyecto en Vercel de `web` a `.` (pasos exactos ya están en `docs/superpowers/specs/2026-07-29-separacion-repo-bot-web-design.md`, sección "Riesgos"). **Hacerlo antes del próximo push a `master`**, o el deploy automático de producción va a fallar.
  - El repo `rental-bot-whatsapp` sigue sin remoto de GitHub — crearlo y hacer el primer push cuando Mili lo pida explícitamente.
  - El pipeline de deploy del bot (GitHub Actions + PM2) y la decisión de compartir número de WhatsApp con narci-bot quedan para el próximo brainstorm, ya anotado en el spec.
