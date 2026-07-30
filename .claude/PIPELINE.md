# Pipeline de 4 agentes — construir cualquier feature nueva en la web

Plantilla reutilizable, **se aplica siempre a toda feature nueva** (decisión de Mili, 2026-06-26) — tenga o no equivalente en el bot de WhatsApp. Se invoca con `/run-pipeline <feature>` (ver `commands/run-pipeline.md`), donde `<feature>` es el nombre de la feature (ej: `gastos`, `auth-header`, `ingresos`).

Requiere haber corrido antes `/explore <feature>` (ver `commands/explore.md`) y tener la aprobación de Mili sobre ese relevamiento — el pipeline no vuelve a investigar el dominio desde cero, parte de lo ya explorado. Si la feature no tiene equivalente en el bot (ej: login), `/explore` igual corre, pero investiga lo que sí aplica (dependencias ya instaladas, patrones existentes en la web, configuración necesaria) en vez de buscar un handler que no existe — ver `commands/explore.md`.

El estado de avance de cada corrida (qué fase quedó hecha, qué falta, qué se aprobó) vive en `STATUS.md`, no acá. Este archivo describe el proceso, no una corrida puntual.

**Cada feature tiene su propia carpeta de artifacts: `.claude/artifacts/<feature>/`** (`po-output.json`, `designer-output.json`, `qa-output.json`, y `explore.md`, que ahora siempre se guarda — ver `commands/explore.md`). Nunca uses el nombre de archivo plano sin la carpeta — eso fue un error de la primera corrida (gastos) que pisaba artifacts de una feature con la de otra; ya está corregido, no lo repitas.

## Cómo se ejecuta cada fase

Cada una de las 4 fases (PO, Designer, Developer, QA) corre como un **subagente aislado** (Agent tool, `subagent_type: general-purpose`), no inline en la conversación con Mili — ver mecánica concreta en `commands/run-pipeline.md`. Motivo: evitar que el detalle de cada fase, sobre todo las verificaciones con Playwright de Developer/QA (screenshots, DOM, logs de red), se acumule en el historial de la sesión. Es la misma lógica que llevó a archivar `STATUS.md` por feature cerrada (ver `CONTEXT.md`): aislar lo que es ruido de proceso de lo que hace falta recordar.

Cada subagente de fase:
- Recibe en su prompt qué fase es, la feature, la rama (ya posicionada), qué artifacts previos leer y dónde escribir el suyo — autocontenido, sin asumir que vio esta conversación.
- Hace su trabajo completo (incluidas idas y vueltas internas) dentro de su propio contexto aislado.
- Termina con un **resumen corto** (no el JSON completo del artifact, no logs de Playwright) para mostrar en el chat antes del gate de aprobación. El detalle fino queda en el artifact en disco y en `viewer.html` (`node scripts/pipeline-viewer.mjs`), no se duplica en el chat ni en `STATUS.md`.

El orquestador (esta conversación) nunca hace el trabajo de una fase directamente — lanza el subagente, muestra su resumen, espera la aprobación de Mili, y lanza el siguiente.

---

## Setup inicial

1. Creá la rama `feature/<feature>-ui` y posicionate en ella (si ya existe, posicionate y avisá que ya existía).
2. Creá la carpeta `.claude/artifacts/<feature>/` si no existe.
3. Confirmá en qué rama quedaste antes de seguir.

---

## AGENTE 1: Product Owner

**Rol:** Traducir el relevamiento de `/explore <feature>` a requerimientos de UI (haya o no flujo de bot detrás).

Con base en el relevamiento de `/explore <feature>` (artifact o resumen ya aprobado por Mili), producí `.claude/artifacts/<feature>/po-output.json`:

```json
{
  "user_stories": [
    {
      "id": "US-01",
      "as_a": "administrador",
      "i_want": "...",
      "so_that": "...",
      "acceptance_criteria": ["..."]
    }
  ],
  "form_fields": [
    {
      "name": "campo",
      "type": "text|number|select|date|file",
      "required": true,
      "validation": "...",
      "source_in_bot": "en qué paso del bot se captura (o 'N/A' si es nuevo en la web)"
    }
  ],
  "business_rules": ["..."],
  "out_of_scope": ["cosas que podrían esperarse de esta feature pero NO se incluyen en esta iteración (del bot si aplica, o de expectativas razonables si no)"]
}
```

Commit: `[agent-po] user stories y campos definidos`
Mostralo en pantalla y esperá aprobación antes de seguir.

---

## AGENTE 2: Designer

**Rol:** Definir estructura y estados de la UI (sin CSS todavía).

Leé `.claude/artifacts/<feature>/po-output.json` y producí `.claude/artifacts/<feature>/designer-output.json`:

```json
{
  "flow": [
    {
      "step": 1,
      "screen": "nombre de la pantalla",
      "fields_shown": ["..."],
      "user_action": "...",
      "next_step": 2
    }
  ],
  "component_tree": [
    {
      "component": "NombreComponente",
      "children": ["..."],
      "props": ["..."],
      "states": ["idle", "loading", "error", "success"]
    }
  ],
  "validations_per_step": {
    "step_1": ["..."]
  }
}
```

Si el dominio ya tiene un patrón de UI equivalente en la web (ej: subida de comprobante, wizard de varios pasos), el component tree debe reusarlo/extenderlo en vez de inventar uno nuevo — revisá `src/components` y `src/app` antes de diseñar desde cero.

Commit: `[agent-designer] estructura de componentes y flujo`
Mostralo y esperá aprobación.

---

## AGENTE 3: Developer

**Rol:** Escribir el código React.

Leé ambos artifacts anteriores y construí el formulario.

Reglas:
- TypeScript estricto.
- Usá los tipos que ya existen en el proyecto (`src/lib/types.ts`); si falta alguno, agregalo ahí, no lo dupliques en el componente.
- Conectá con Supabase usando los clientes ya configurados (`src/lib/supabase/`).
- Sin estilos por ahora, solo estructura y lógica funcional.
- Si algo del diseño es ambiguo, tomá la decisión más simple y dejá un comentario `// TODO: confirmar con Mili`.
- Adaptá los nombres de archivo/componente al dominio real de `<feature>` (ej: para gastos sería `ExpenseForm.tsx`, no copies nombres de otra feature).

Archivos a crear (rutas indicativas, ajustá el nombre a `<feature>`):
- `src/components/<feature>/<Feature>Form.tsx`
- `src/components/<feature>/<Feature>Form.types.ts` (si no existen ya los tipos necesarios en `lib/types.ts`)
- `src/hooks/use<Feature>Submit.ts`

Commit: `[agent-dev] formulario base sin estilos`
Mostralo y esperá aprobación.

---

## AGENTE 4: QA / Critic

**Rol:** Revisar que el código cumple los criterios del PO.

Leé `.claude/artifacts/<feature>/po-output.json` y el código del Developer. Para cada user story y criterio de aceptación, verificá si el código lo cumple. Producí `.claude/artifacts/<feature>/qa-output.json`:

```json
{
  "summary": "PASS | FAIL",
  "results": [
    {
      "story_id": "US-01",
      "status": "PASS | FAIL",
      "issue": "descripción si falla",
      "fix_suggestion": "qué cambiar"
    }
  ],
  "todos_found_in_code": ["los comentarios TODO que dejó el Developer"],
  "critical_missing": ["cosas bloqueantes que faltan"]
}
```

Si `summary` es `FAIL`: listá los fixes necesarios, volvé al Developer y pedile que los corrija. Repetí hasta `PASS` o hasta 3 intentos — si no se resuelve, escalá a Mili.

**Un defecto real encontrado acá (el código no hace lo que el propio `po-output.json` pide) se registra en `BUGS.md`** al corregirlo — sección "Cerrados", con severidad (ver criterio ahí), commit del fix y feature de origen. No es lo mismo que un `todo_found_in_code` o un `critical_missing` sin decisión tomada todavía: eso queda en el artifact y en el gate, no en `BUGS.md`, hasta que haya un fix aplicado o una decisión explícita de Mili de dejarlo abierto como bug conocido.

Commit: `[agent-qa] revisión completada`
Mostralo.

---

## Reglas generales (ver también `CONTEXT.md`)

- Nunca saltees un gate sin aprobación explícita de Mili.
- Si encontrás algo ambiguo que puede afectar decisiones de negocio, primero revisá `POLITICAS.md` — si ya está resuelto ahí, aplicalo directo. Si no, pará y preguntá (máximo 5 preguntas por gate, solo si son bloqueantes).
- Todos los artifacts van en `.claude/artifacts/` y no se borran.
- Si algo no tiene sentido dado lo explorado del proyecto, decilo antes de inventar.
- Si el Developer o el QA ejecutan la app real (Playwright, curl, etc.) contra la base de Supabase real — no un entorno de test separado — y eso crea filas de prueba, hay que borrarlas antes de terminar la fase y dejar constancia en `STATUS.md` de qué se creó y se borró. Las tablas de gastos/ingresos/reservas son datos financieros reales, no un sandbox.
- Un bug encontrado en cualquier fase (no solo QA) va a `BUGS.md`, no a `STATUS.md` — ver criterio de severidad ahí.
