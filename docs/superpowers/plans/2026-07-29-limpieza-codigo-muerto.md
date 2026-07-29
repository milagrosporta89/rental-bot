# Limpieza de código muerto rental-bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar el código muerto y los archivos sin uso identificados por `/code-quality` sobre `src/` (bot) y `web/` (Next.js), y archivar 4 scripts manuales ya cumplidos, sin tocar el sistema de comisiones pausado ni reestructurar archivos grandes.

**Architecture:** Sin cambios de arquitectura. Es una pasada de eliminación quirúrgica: cada tarea borra archivos/símbolos puntuales y corre la verificación del stack correspondiente (tsc/jest para el bot, tsc/next build/eslint para la web) antes de commitear.

**Tech Stack:** Bot — Node.js/TypeScript, tsc, Jest. Web — Next.js (App Router), TypeScript, ESLint.

## Global Constraints

- No tocar el sistema de comisiones pausado: los 6 componentes de `cuenta-paola/` (`AjusteLibreModal`, `CancelacionesPendientesSection`, `CierreCuentaSection`, `SaldoPaolaCard`, `TablaMovimientos`, `TablaReconciliacionComision`), `TIPO_MOVIMIENTO_LABEL` y `RESOLUCION_CANCELACION_LABEL` en `web/src/lib/types.ts`, `marcarResolucionCancelacion` en `web/src/app/actions/ingresos.ts`, `saldoPendienteDesglosado` en `web/src/lib/cuentaPaola.ts`. Vuelven a usarse en agosto.
- No reestructurar `src/handlers/reservas.ts`, `web/src/app/reservas/nueva/page.tsx` ni `web/src/app/reservas/[id]/pago/page.tsx` — evaluados y descartados para refactor en el diseño.
- Antes de cada eliminación de símbolo, ya se verificó por grep que no tiene otros usos en el repo (ver spec `docs/superpowers/specs/2026-07-29-limpieza-codigo-muerto-design.md`); si un paso de verificación (tsc/build/test) falla después de un cambio, no seguir a la siguiente tarea sin resolverlo.
- Cada tarea termina con un commit propio (no acumular cambios de varias tareas en un solo commit).

---

### Task 1: Archivar scripts manuales sin uso

**Files:**
- Move: `scripts/migrar-datos.js` → `_archive/scripts/migrar-datos.js`
- Move: `scripts/diagnostico-sheets.js` → `_archive/scripts/diagnostico-sheets.js`
- Move: `scripts/generar-resumen.js` → `_archive/scripts/generar-resumen.js`
- Move: `scripts/setup/setup-sheets.js` → `_archive/scripts/setup/setup-sheets.js`

**Interfaces:**
- Consumes: nada — tarea independiente, no depende de otras.
- Produces: nada — ningún archivo activo importa estos scripts (confirmado en el reporte de `/code-quality`: no aparecen en ningún `package.json` ni son importados).

- [ ] **Step 1: Mover los 4 scripts a `_archive/scripts/`**

`_archive/` ya existe y está en `.gitignore` (mismo patrón usado para scripts de seed/setup archivados previamente en `_archive/scripts/debug/` y `_archive/scripts/setup/`).

```bash
mv scripts/migrar-datos.js _archive/scripts/migrar-datos.js
mv scripts/diagnostico-sheets.js _archive/scripts/diagnostico-sheets.js
mv scripts/generar-resumen.js _archive/scripts/generar-resumen.js
mv scripts/setup/setup-sheets.js _archive/scripts/setup/setup-sheets.js
```

- [ ] **Step 2: Verificar que no queda ninguna referencia a los scripts movidos**

Run: `grep -rn "migrar-datos\|diagnostico-sheets\|generar-resumen\|setup-sheets" package.json scripts/ --include="*.json" --include="*.js" --include="*.ts" 2>/dev/null`
Expected: sin resultados (o solo referencias dentro de los propios scripts movidos, que ya no importan).

- [ ] **Step 3: Verificar build del bot (los scripts no afectan `src/`, pero confirma que nada quedó roto)**

Run: `npm run build`
Expected: compila sin errores (mismo resultado que antes de mover los scripts).

- [ ] **Step 4: Stage y commit**

```bash
git add scripts/migrar-datos.js scripts/diagnostico-sheets.js scripts/generar-resumen.js scripts/setup/setup-sheets.js
git status
git commit -m "chore: archivar scripts de migración/setup ya cumplidos

Mueve migrar-datos.js, diagnostico-sheets.js, generar-resumen.js y
setup-sheets.js a _archive/scripts/ (gitignored) — cumplieron su
función one-time y no están referenciados desde package.json."
```

Nota: como el destino está gitignored, `git add` sobre las rutas originales (que ya no existen en disco) las stagea como eliminadas; el `git status` del paso debe mostrar los 4 archivos como `deleted`, no como `renamed`.

---

### Task 2: Eliminar código muerto en el bot (`src/`)

**Files:**
- Modify: `src/types.ts:8-13`
- Modify: `src/handlers/cash.ts:113-122`
- Modify: `src/services/sheets.ts:308-337`
- Modify: `src/services/whatsapp.ts:62-74,84-107`

**Interfaces:**
- Consumes: nada — tarea independiente.
- Produces: nada nuevo. Elimina `TipoIngreso`, `buscarGastoPorId`, la rama `efectivo_tipo_ingreso` y los campos `messageId`/`buttonReplyTitle` de `WaMessage`; ningún otro archivo del árbol de `src/index.ts` los consume (verificado por grep antes de este plan).

- [ ] **Step 1: Eliminar el tipo `TipoIngreso` sin uso en `src/types.ts`**

```typescript
// Antes (líneas 7-14):
export type TipoIngreso =
  | "deposito_reserva"
  | "saldo_checkin"
  | "transferencia"
  | "efectivo"
  | "airbnb";

// Después: bloque eliminado por completo (queda una sola línea en blanco
// entre `export type Casa = ...;` y `export type CategoriaGasto = ...`)
```

- [ ] **Step 2: Eliminar la rama legacy `efectivo_tipo_ingreso` en `src/handlers/cash.ts`**

```typescript
// Antes (líneas 113-124):
  // Botón de ingreso (desde flujo efectivo_tipo_ingreso — legacy)
  if (buttonId === "efectivo_tipo_ingreso") {
    if (!estado) return false;
    estado.paso = "ingreso_quien";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿Quién realizó el pago?",
      TITULARES_INGRESO.map((t) => ({ id: `efectivo_quien_${t}`, title: t }))
    );
    return true;
  }

  return false;

// Después:
  return false;
```

- [ ] **Step 3: Eliminar la función `buscarGastoPorId` sin uso en `src/services/sheets.ts`**

```typescript
// Eliminar por completo (líneas 308-338, incluye la línea en blanco
// que la separa de la función siguiente):
export async function buscarGastoPorId(id: string): Promise<{
  rowIndex: number; // 1-based, incluye header → fila real en Sheet
  fecha: string;
  monto: number;
  moneda: string;
  categoria: string;
  pagadoPor: string;
  detalle: string;
} | null> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.gastos}!A:J`,
  });
  const filas = res.data.values ?? [];
  for (let i = 1; i < filas.length; i++) {
    if (filas[i][0] === id) {
      return {
        rowIndex: i + 1,
        fecha: filas[i][1] ?? "",
        monto: parsearMonto(filas[i][2]),
        moneda: filas[i][3] ?? "",
        categoria: filas[i][4] ?? "",
        pagadoPor: filas[i][5] ?? "",
        detalle: filas[i][9] ?? "",
      };
    }
  }
  return null;
}
```

- [ ] **Step 4: Correr build después de los primeros 3 cambios**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Eliminar `messageId` y `buttonReplyTitle` de la interfaz `WaMessage` en `src/services/whatsapp.ts`**

```typescript
// Antes:
export interface WaMessage {
  from: string;
  fromName: string;
  messageId: string;
  type: "text" | "image" | "document" | "interactive" | "flow_reply" | "unknown";
  text?: string;
  imageId?: string;
  documentId?: string;
  mimeType?: string;
  buttonReplyId?: string;
  buttonReplyTitle?: string;
  flowData?: Record<string, string>;
}

// Después:
export interface WaMessage {
  from: string;
  fromName: string;
  type: "text" | "image" | "document" | "interactive" | "flow_reply" | "unknown";
  text?: string;
  imageId?: string;
  documentId?: string;
  mimeType?: string;
  buttonReplyId?: string;
  flowData?: Record<string, string>;
}
```

- [ ] **Step 6: Sacar el cálculo y uso de `messageId`/`buttonReplyTitle` en `parseWebhookBody` (mismo archivo)**

```typescript
// Antes:
    const from: string = msg.from;
    const fromName: string = value?.contacts?.[0]?.profile?.name ?? from;
    const messageId: string = msg.id;
    const type: string = msg.type;

    if (type === "text") {
      return { from, fromName, messageId, type: "text", text: msg.text?.body };
    }
    if (type === "image") {
      return { from, fromName, messageId, type: "image", imageId: msg.image?.id, mimeType: msg.image?.mime_type };
    }
    if (type === "document") {
      return { from, fromName, messageId, type: "document", documentId: msg.document?.id, mimeType: msg.document?.mime_type };
    }
    if (type === "interactive") {
      const itype = msg.interactive?.type;
      if (itype === "nfm_reply") {
        const flowData = JSON.parse(msg.interactive.nfm_reply?.response_json ?? "{}") as Record<string, string>;
        return { from, fromName, messageId, type: "flow_reply", flowData };
      }
      const reply = itype === "button_reply" ? msg.interactive.button_reply : msg.interactive?.list_reply;
      return { from, fromName, messageId, type: "interactive", buttonReplyId: reply?.id, buttonReplyTitle: reply?.title };
    }
    return { from, fromName, messageId, type: "unknown" };

// Después:
    const from: string = msg.from;
    const fromName: string = value?.contacts?.[0]?.profile?.name ?? from;
    const type: string = msg.type;

    if (type === "text") {
      return { from, fromName, type: "text", text: msg.text?.body };
    }
    if (type === "image") {
      return { from, fromName, type: "image", imageId: msg.image?.id, mimeType: msg.image?.mime_type };
    }
    if (type === "document") {
      return { from, fromName, type: "document", documentId: msg.document?.id, mimeType: msg.document?.mime_type };
    }
    if (type === "interactive") {
      const itype = msg.interactive?.type;
      if (itype === "nfm_reply") {
        const flowData = JSON.parse(msg.interactive.nfm_reply?.response_json ?? "{}") as Record<string, string>;
        return { from, fromName, type: "flow_reply", flowData };
      }
      const reply = itype === "button_reply" ? msg.interactive.button_reply : msg.interactive?.list_reply;
      return { from, fromName, type: "interactive", buttonReplyId: reply?.id };
    }
    return { from, fromName, type: "unknown" };
```

- [ ] **Step 7: Build y tests**

Run: `npm run build && npm test`
Expected: build sin errores, toda la suite de Jest en verde (mismo resultado que antes de esta tarea — no se está agregando comportamiento nuevo).

- [ ] **Step 8: Stage y commit**

```bash
git add src/types.ts src/handlers/cash.ts src/services/sheets.ts src/services/whatsapp.ts
git commit -m "chore: eliminar código muerto en el bot

Quita TipoIngreso (tipo sin uso), la rama legacy efectivo_tipo_ingreso
en cash.ts (el botón que la disparaba ya no existe), buscarGastoPorId
(función sin llamador) y los campos messageId/buttonReplyTitle de
WaMessage (se calculan al parsear el webhook pero buildCtx() nunca
los lee)."
```

---

### Task 3: Eliminar componentes UI sin uso en la web

**Files:**
- Delete: `web/src/components/calendario/ViewToggle.tsx`
- Delete: `web/src/components/ui/badge.tsx`
- Delete: `web/src/components/ui/toast.tsx`
- Modify: `web/src/app/globals.css:75-82`

**Interfaces:**
- Consumes: nada — tarea independiente de las anteriores.
- Produces: nada. Ninguno de los 3 componentes tiene imports en `web/src` (confirmado en el reporte de `/code-quality`).

- [ ] **Step 1: Borrar los 3 archivos de componentes sin uso**

```bash
git rm web/src/components/calendario/ViewToggle.tsx web/src/components/ui/badge.tsx web/src/components/ui/toast.tsx
```

- [ ] **Step 2: Sacar el CSS huérfano del toast en `web/src/app/globals.css`**

```css
/* Antes: */
/* Entrada del toast (web/src/components/ui/toast.tsx) */
@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-toast-in {
  animation: toast-in 200ms ease-out;
}

/* Entrada/salida del bottom sheet mobile (web/src/components/ui/dialog.tsx) */

/* Después: */
/* Entrada/salida del bottom sheet mobile (web/src/components/ui/dialog.tsx) */
```

- [ ] **Step 3: Verificar que no quedó ninguna referencia a los componentes borrados**

Run: `grep -rn "components/ui/badge\|components/ui/toast\|components/calendario/ViewToggle" web/src`
Expected: sin resultados.

- [ ] **Step 4: Type-check, build y lint de la web**

```bash
cd web
npx tsc --noEmit
npm run build
npm run lint
cd ..
```

Expected: los tres comandos terminan sin errores.

- [ ] **Step 5: Stage y commit**

```bash
git add web/src/components/calendario/ViewToggle.tsx web/src/components/ui/badge.tsx web/src/components/ui/toast.tsx web/src/app/globals.css
git commit -m "chore: eliminar componentes UI sin uso en la web

Borra ViewToggle.tsx, badge.tsx y toast.tsx (cero imports en web/src)
y el CSS huérfano que dejaba toast.tsx en globals.css."
```

---

### Task 4: Eliminar código muerto puntual en la web

**Files:**
- Modify: `web/src/app/reservas/[id]/page.tsx:8,47`
- Modify: `web/src/app/reservas/nueva/page.tsx:13`
- Modify: `web/src/lib/dates.ts:35-40`

**Interfaces:**
- Consumes: nada — tarea independiente de las anteriores.
- Produces: nada. `generarIdReserva` no tiene llamador en `web/src` (confirmado en el reporte de `/code-quality`); `color` y el import `hoy` no se usan en sus respectivos archivos (confirmado por `tsc --noUnusedLocals` durante el análisis).

- [ ] **Step 1: Sacar la variable `color` sin usar en `web/src/app/reservas/[id]/page.tsx`**

`CASA_COLORES` queda sin otro uso en el archivo una vez sacada esta línea, así que también sale del import.

```typescript
// Antes (línea 8):
import { Reserva, Ingreso, CASA_COLORES, CASA_LABELS, PLATAFORMA_LABEL, ESTADO_VISUAL_BADGE, ESTADO_VISUAL_LABEL } from '@/lib/types'

// Después:
import { Reserva, Ingreso, CASA_LABELS, PLATAFORMA_LABEL, ESTADO_VISUAL_BADGE, ESTADO_VISUAL_LABEL } from '@/lib/types'
```

```typescript
// Antes (línea 47):
  const num = casaNum(r.casa)
  const color = CASA_COLORES[num] ?? '#94a3b8'
  const estado = estadoVisual(r.estado_reserva, r.fecha_entrada, r.fecha_salida)

// Después:
  const num = casaNum(r.casa)
  const estado = estadoVisual(r.estado_reserva, r.fecha_entrada, r.fecha_salida)
```

- [ ] **Step 2: Sacar el import `hoy` sin usar en `web/src/app/reservas/nueva/page.tsx`**

```typescript
// Antes (línea 13):
import { toISO, toDDMMYYYY, calcularNoches, hoy } from '@/lib/dates'

// Después:
import { toISO, toDDMMYYYY, calcularNoches } from '@/lib/dates'
```

- [ ] **Step 3: Eliminar la función `generarIdReserva` sin uso en `web/src/lib/dates.ts`**

```typescript
// Antes (líneas 35-41):
/** Genera un id de reserva tipo TMP-2025-0042 */
export function generarIdReserva(n: number): string {
  const año = new Date().getFullYear()
  return `TMP-${año}-${String(n).padStart(4, '0')}`
}

/** Hoy en DD/MM/YYYY */

// Después:
/** Hoy en DD/MM/YYYY */
```

- [ ] **Step 4: Verificar que no quedó ninguna referencia a `generarIdReserva`**

Run: `grep -rn "generarIdReserva" web/src`
Expected: sin resultados.

- [ ] **Step 5: Type-check, build y lint de la web**

```bash
cd web
npx tsc --noEmit
npm run build
npm run lint
cd ..
```

Expected: los tres comandos terminan sin errores.

- [ ] **Step 6: Stage y commit**

```bash
git add web/src/app/reservas/\[id\]/page.tsx web/src/app/reservas/nueva/page.tsx web/src/lib/dates.ts
git commit -m "chore: eliminar código muerto puntual en la web

Saca la variable color y el import CASA_COLORES sin usar en
reservas/[id]/page.tsx, el import hoy sin usar en reservas/nueva/page.tsx,
y la función generarIdReserva sin llamador en lib/dates.ts."
```

---

### Task 5: Verificación final completa

**Files:** ninguno — tarea de verificación, sin cambios de código.

**Interfaces:**
- Consumes: el estado final del árbol tras las Tasks 1-4.
- Produces: confirmación de que ambos proyectos (bot y web) compilan, testean y lintean limpio después de toda la pasada.

- [ ] **Step 1: Build y tests del bot**

```bash
npm run build
npm test
```

Expected: build sin errores, toda la suite de Jest en verde.

- [ ] **Step 2: Build y lint de la web**

```bash
cd web
npm run build
npm run lint
cd ..
```

Expected: build de Next.js sin errores, lint sin warnings/errores nuevos.

- [ ] **Step 3: Confirmar que no quedaron referencias colgantes a nada de lo eliminado**

```bash
grep -rn "TipoIngreso\|buscarGastoPorId\|efectivo_tipo_ingreso" src/
grep -rn "generarIdReserva\|ViewToggle\|components/ui/badge\|components/ui/toast" web/src/
```

Expected: sin resultados en ninguno de los dos.

- [ ] **Step 4: Revisar el estado final de git**

```bash
git status
git log --oneline -6
```

Expected: working tree limpio, 4 commits nuevos (uno por tarea) sobre la rama actual.
