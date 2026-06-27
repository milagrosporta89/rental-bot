# Exploración: responsive en toda la web

Fecha: 2026-06-26. `/explore responsive`.

## Lo que entendí del dominio

**Sin equivalente en el bot** — es una feature puramente de la web (el bot no tiene "pantalla", no aplica.

Investigación de código (no inferencia — confirmado con grep sobre todo `web/src`):

- **Cero uso real de breakpoints de Tailwind (`sm:`/`md:`/`lg:`) en toda la app**, salvo un solo lugar: `reservas/[id]/page.tsx:94` (`grid-cols-2 ... sm:grid-cols-3`). Todo lo demás es desktop-only, sin ninguna adaptación.
- No hace falta ninguna dependencia nueva — Tailwind v4 ya está instalado y sus prefijos de breakpoint (`sm:`, `md:`, `lg:`) cubren todo lo necesario.
- El `<DialogContent>` base (`components/ui/dialog.tsx`) ya es mobile-safe por defecto (`w-full max-w-lg`, sin rounded en mobile) — el problema no es el contenedor del modal, es lo que hay *adentro*.

**Catálogo concreto de problemas (grep real, no supuestos):**

| Componente | Problema | Evidencia |
|---|---|---|
| `ReservaModal.tsx` | Form en grilla fija de 4 columnas dentro de un modal `max-w-md` | línea 205 `grid grid-cols-4` |
| `reservas/nueva/page.tsx` (2 pasos) | Form en grilla fija de 4 columnas, dos veces | líneas 308 y 507 `grid grid-cols-4` |
| `reservas/[id]/pago/page.tsx` | Form en grilla fija de 4 columnas + otra de 2 | líneas 320 y 343 |
| `BloqueoModal.tsx` | Grilla fija de 2 columnas | línea 67 |
| `gastos/FormularioGasto.tsx` | Grilla fija de 2 columnas | (confirmado en sesiones previas) |
| `CalendarView.tsx` (toolbar, NO el calendario en sí) | Barra de prev/next + selector de mes + "Hoy" + "Bloquear fechas" en una sola fila sin `flex-wrap` | línea 69 |
| `GastosTable.tsx` (toolbar buscador+filtros) | Fila sin `flex-wrap` | línea 134 |
| `ReservasTable.tsx` (toolbar) | Ya tiene `flex-wrap` (queda de un cambio previo) — revisar si alcanza o hay que ajustar igual | línea 143 |
| `NavTabs.tsx` (header) | Logo + 4 accesos + Dashboard + logout en una sola fila sin wrap ni colapso a menú | todo el archivo |
| Paginadores de tablas (`flex items-center justify-between`) | Mostrar N / página X de Y / flechas, todo en una fila — podría apretarse en mobile | `ReservasTable.tsx:333`, `GastosTable.tsx:241` |

**Lo que el código YA cubre bien sin tocar nada** (por pedido explícito de Mili, no hace falta rediseñar):
- El cuerpo del calendario (FullCalendar) ya scrollea horizontalmente.
- El cuerpo de las tablas (`<table>` dentro de `overflow-x-auto`) ya scrollea horizontalmente.

## Flujo actual del bot

Sin equivalente en el bot.

## Gaps o ambigüedades

1. No verifiqué visualmente (con un navegador real) ninguno de estos problemas todavía — todo el catálogo de arriba es por lectura de código (grids fijos sin breakpoints), no por screenshots. Para confirmar visualmente en viewport mobile (ej. 375px) necesito loggearme, y eso requiere una cuenta — incluyo la pregunta abajo.
2. No identifiqué ningún breakpoint estándar ya elegido en el proyecto (no hay convención previa de "mobile = X px"). Voy a asumir los breakpoints default de Tailwind (`sm`=640px, `md`=768px, `lg`=1024px) salvo que se diga lo contrario.
3. El menú de navegación (`NavTabs`) en mobile probablemente necesite colapsar a un patrón distinto (ej. menú hamburguesa, o accesos apilados) — esto es una decisión de diseño real, no solo "agregar un breakpoint", y quiero confirmarla antes de que el Designer la defina unilateralmente.
4. Los modales con grillas fijas (`ReservaModal`, `BloqueoModal`, pago, gasto) tienen muchos campos — en mobile lo natural es 1 columna (todo apilado). ¿Confirmás ese criterio general, o hay alguno que prefieras mantener en 2 columnas aunque se angoste (ej. Monto/Moneda juntos)?

## Preguntas para Mili

1. Para verificar visualmente los problemas y, más adelante, el trabajo del Developer/QA en viewport mobile, voy a necesitar loggearme con una cuenta en varios momentos de este pipeline (no solo una vez). ¿Te parece bien que, en vez de pedirte autorización cada vez, dejemos una cuenta de prueba fija y descartable solo para verificación (ej. `qa-responsive@example.com`) que se borra recién al cerrar esta feature? Necesito tu autorización explícita para crearla.
2. `NavTabs` (el header) en mobile: ¿menú hamburguesa que despliega los accesos, o algo más simple (ej. apilar los accesos abajo del logo)?
3. ¿Confirmás que todos los formularios en grilla (reserva nueva, pago, bloqueo, gasto) pasan a 1 columna en mobile, sin excepciones?
4. ¿Hay algún breakpoint mínimo que te importe soportar (ej. "tiene que verse bien desde 320px") o alcanza con los estándares de Tailwith (640/768/1024)?
