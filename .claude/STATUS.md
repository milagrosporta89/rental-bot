# Status — log de sesiones

Entradas nuevas arriba. No se borran las viejas.

---

## 2026-06-26 (cont. 2) — Feature: gastos · Rama: `feature/expense-ui`

**Correcciones de Mili sobre PO y Designer ya commiteados (antes de aprobar, en revisión):**
- `cotizacion` deja de ser un campo del formulario en cualquier camino (manual o comprobante). Se calcula en el servidor al guardar, usando la cotización de la **fecha del gasto** (la del comprobante vía OCR, o la ingresada a mano) — nunca la fecha en que se está registrando. Es un dato para análisis posterior, no una decisión del usuario al cargar. → commit `9396e30` (po-output.json) y `5b06c35` (designer-output.json).
- Se agrega una pestaña **"Gastos"** al nav principal (`web/src/components/layout/NavTabs.tsx`), junto a "Calendario" y "Reservas", ruta `/gastos`. Modelado como step 0 ("NavegacionPrincipal") en el flow del Designer y como componente `NavTabs` en el component_tree. → commit `5b06c35`.
- Herramienta nueva: `node scripts/pipeline-viewer.mjs` genera `.claude/artifacts/viewer.html`, visor standalone con tabs PO/Designer/Developer/QA (no se commitea, está en `.gitignore`).

**Pendiente / próximo paso:**
- Mostrar PO y Designer corregidos a Mili y conseguir aprobación antes de arrancar **Agente 3 (Developer)**.
- El Developer deberá: crear `web/src/app/gastos/page.tsx` (nueva ruta), agregar el tab a `NavTabs.tsx`, e implementar el cálculo de cotización server-side por fecha del gasto (revisar si `/api/cotizacion` necesita un parámetro de fecha — hoy no lo tiene, lo usa ingresos sin fecha explícita).

---

## 2026-06-26 (cont.) — Feature: gastos · Rama: `feature/expense-ui`

**Hecho en esta sesión:**
- Commiteada la estructura de `.claude/` (`f5af3d8`).
- **Agente 2 (Designer) completado** → commit `fc07d6f` `[agent-designer] estructura de componentes y flujo` → `.claude/artifacts/designer-output.json`. Flujo de 6 pantallas (selección de camino → dropzone/duplicado/form-comprobante en el camino foto, o form manual directo → confirmación obligatoria común a ambos). Reusa 1 a 1 los 4 estados del dropzone de `pago/page.tsx` (`ComprobanteDropzone`) y su función `ro()` de campos readonly; agrega dos piezas nuevas que no existen en ingresos: `DuplicadoBloqueo` (bloqueo por `nro_operacion` repetido, antes de confirmar) y `ConfirmacionGasto` (pantalla de revisión obligatoria — en ingresos el submit es directo, sin paso intermedio).
- Pendiente de aprobación de Mili en el chat antes de pasar al Agente 3.

**Ver `CONTEXT.md` (sección "Backends"):** se editó directamente para aclarar que el código del bot que hoy escribe gastos a Sheets está desactualizado/pendiente de migrar — no es la arquitectura objetivo. No cambia nada de lo ya construido en esta feature (la web ya es Supabase-only).

**Pendiente / próximo paso:**
- Si se aprueba el Designer: arrancar **Agente 3 (Developer)** → leer `po-output.json` + `designer-output.json`, construir el formulario en `web/src/components/gastos/`.

---

## 2026-06-26 — Feature: gastos · Rama: `feature/expense-ui`

**Hecho en esta sesión:**
- Se ordenó la estructura de `.claude/` (este archivo, `CONTEXT.md`, `PIPELINE.md`, `commands/explore.md`, `commands/run-pipeline.md`). El pipeline de 4 agentes y el comando de exploración quedaron genéricos/parametrizados por feature, no específicos de gastos.
- `/explore gastos` corrido y aprobado por Mili → persistido en `.claude/artifacts/gastos-explore.md` (no existía como archivo, solo había quedado en el chat — se agregó retroactivamente).
- Rama `feature/expense-ui` creada.
- **Agente 1 (PO) completado y aprobado en el chat** → commit `f2140d2` `[agent-po] user stories y campos definidos` → `.claude/artifacts/po-output.json` (4 user stories, 16 campos, 9 business rules, 6 out-of-scope).

**Pendiente / próximo paso:**
- Arrancar **Agente 2 (Designer)** → leer `po-output.json`, producir `.claude/artifacts/designer-output.json`. El component tree debe reusar el patrón de dropzone de comprobante de `web/src/app/reservas/[id]/pago/page.tsx` (no inventar uno nuevo) — ver decisión #2 de Mili en `gastos-explore.md`.

**Decisiones de negocio ya tomadas (no volver a preguntar):**
- Backend: Supabase, tabla `gastos` (ya existe, vacía). Sin Sheets.
- UI soporta manual + foto/comprobante con OCR.
- Categorías: las 12 de `CategoriaGasto`, incluyendo `jardinero` y `comision`.
- Confirmación obligatoria siempre, en ambos caminos.
- `registrado_por`: hardcodeado/placeholder hasta que exista login.
