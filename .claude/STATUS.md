# Status — log de sesiones

Entradas nuevas arriba. No se borran las viejas.

---

## 2026-06-26 (cont. 4) — Feature: gastos · Rama: `feature/expense-ui`

**Agente 4 (QA) completado** → commit `88a4368` `[agent-qa] revisión completada` → `.claude/artifacts/qa-output.json`. **`summary: PASS`** — las 4 user stories pasan, `critical_missing` vacío. `tsc --noEmit` confirmado limpio otra vez de forma independiente.

**Pipeline de la feature gastos: completo (PO → Designer → Developer → QA, los 4 con PASS/aprobación).**

**Sugerencias menores no bloqueantes que quedaron en `qa-output.json` (para decidir si se atienden ahora o después):**
- Camino manual no fija `banco_origen: 'Efectivo'` por defecto (el bot sí lo hace) — rompe paridad de datos para análisis histórico.
- No hay `UNIQUE constraint` versionado en SQL sobre `nro_operacion` en la tabla `gastos` — la defensa contra duplicados es doble (cliente + server) pero no atómica a nivel DB ante condiciones de carrera.
- El patrón de auto-fetch HTTP en `gastos.ts` (server action llamando a su propia API route) sigue como deuda técnica menor, confirmado no bloqueante por QA.

**Pendiente / próximo paso:** decidir con Mili si se atienden las sugerencias menores, se pasa a una pasada de estilos (el Developer no aplicó CSS, por instrucción del pipeline), o se mergea así a `master`.

---

## 2026-06-26 (cont. 3) — Feature: gastos · Rama: `feature/expense-ui`

**Agente 3 (Developer) completado** → commit `90cbbb8` `[agent-dev] formulario base sin estilos` (15 archivos, `tsc --noEmit` y eslint sin errores, verificado independientemente).

- Nuevo: `web/src/app/actions/gastos.ts` (`crearGasto`, `buscarGastoDuplicado`), `web/src/app/gastos/page.tsx`, 8 componentes en `web/src/components/gastos/` (1:1 con el component_tree del Designer), `web/src/hooks/useGastoSubmit.ts`.
- Modificado: `web/src/lib/types.ts` (tipo `Gasto`, `CategoriaGasto`, `CATEGORIA_GASTO_LABEL`, `TITULARES_PAGADOR`), `web/src/app/api/cotizacion/route.ts` (ahora acepta `?fecha=`, usa el endpoint historical de bluelytics cuando no es hoy — réplica de `src/services/dolar.ts`), `web/src/app/api/comprobante/route.ts` (acepta `tipo: 'gasto'|'ingreso'`), `NavTabs.tsx` (tab "Gastos").
- `cotizacion`/`monto_ars`/`monto_usd` se calculan enteramente en el server action, nunca en el cliente — consistente con la corrección de Mili.

**TODOs dejados por el Developer:**
- `gastos.ts:6` — registrado_por hardcodeado, reemplazar con login.
- `gastos.ts:30` — el fetch a `/api/cotizacion` desde el server action usa `http://localhost:3000` como fallback si no hay `NEXT_PUBLIC_BASE_URL`. Funciona en dev, pero es un auto-llamado HTTP a la propia app — más prolijo sería factorizar la lógica de cotización a una función compartida en `lib/` que use tanto la ruta API como la server action, sin pasar por HTTP. Lo anoto para que QA lo evalúe como mejora, no es bloqueante.
- `FormularioGasto.tsx:33` — el OCR no infiere `pagado_por`, queda siempre editable en el camino de comprobante.

**Pendiente / próximo paso:**
- Mostrar a Mili para aprobación → si aprueba, arrancar **Agente 4 (QA)**.

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
