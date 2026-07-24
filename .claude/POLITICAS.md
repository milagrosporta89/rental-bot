# Políticas ya decididas por Mili

Registro vivo de decisiones que ya se aprobaron una vez y aplican como regla general de acá en adelante — no son específicas de una sola feature. **Antes de plantear un hallazgo o una pregunta en un gate del pipeline** (ver `PIPELINE.md`, `CONTEXT.md`), revisar este archivo: si el punto ya está resuelto acá, se cita la política existente en vez de volver a preguntarlo. Esto es lo que evita repreguntar lo mismo en cada feature nueva.

Cada entrada: la regla, de qué sesión/feature salió, y la fecha. No se borran entradas viejas — si una política se revierte o se ajusta, se agrega una corrección nueva al lado (mismo criterio que `STATUS.md`).

---

## Proceso / pipeline

- **El pipeline de 4 agentes (PO→Designer→Developer→QA) corre siempre para toda feature nueva**, tenga o no equivalente en el bot de WhatsApp. *(Decisión de Mili, 2026-06-26, commit `83e90ec` — ver `CONTEXT.md`.)*
- **Cada feature tiene su propia carpeta de artifacts** (`.claude/artifacts/<feature>/`) — nunca nombre de archivo plano sin carpeta. *(Corregido tras pisar artifacts de gastos con los de otra feature, commit `0198fd9`.)*
- **Máximo 5 preguntas por gate, solo si son bloqueantes** (decisiones de negocio que no se pueden inferir del código o de artifacts previos). *(`CONTEXT.md`.)*
- **`STATUS.md` se actualiza al final de cada sesión**; al cerrar una feature, el historial detallado de las rondas se archiva en `.claude/artifacts/<feature>/status.md` y en `STATUS.md` queda solo el resumen de cierre. *(`CONTEXT.md`.)*
- **Antes de escribir un comando o agente nuevo, revisar qué ya existe** en `.claude/commands/` y `.claude/skills/` para no duplicar (`qa-manual`, `ux-review`, `ui-ux-pro-max` ya existen). *(`CONTEXT.md`.)*

## Seguridad / datos sensibles

- **Nunca escribir credenciales reales (contraseñas, tokens) en archivos**, ni siquiera temporalmente para un script de prueba. *(Bloqueado por el clasificador de permisos, 2026-06-26 — ver también memoria `feedback_no_test_credentials.md`.)*
- **Cada alta de usuario en Supabase Auth necesita autorización explícita puntual de Mili** — no hay autorización "de una vez para siempre" dentro de una misma sesión, aunque ya se haya autorizado una cuenta antes. *(Bloqueado dos veces por el clasificador de permisos, 2026-06-26.)*
- **Si Developer o QA ejecutan la app real (Playwright, curl, etc.) contra Supabase real y eso crea filas de prueba, hay que borrarlas antes de terminar la fase** y dejar constancia en `STATUS.md` de qué se creó y se borró — las tablas de gastos/ingresos/reservas son datos financieros reales, no un sandbox. *(`PIPELINE.md`; reforzado tras el incidente de 2 reservas de prueba sin poder borrar por falta de `eliminarReserva`, feature responsive, 2026-06-26.)*
- **Limpiar o insertar datos simulados en una base (staging o prod) solo con autorización explícita de Mili**, confirmando primero que ese entorno no tiene huéspedes/datos reales. *(Feature cuenta-paola, 2026-06-28 — Mili confirmó staging antes de autorizar el borrado.)*

## UX / diseño responsive

- **Grillas de formularios a 1 columna en mobile**, excepto los pares ya confirmados que quedan en 2 columnas: Check-in/Check-out, Monto+Moneda, Plataforma+Estado (`ReservaModal`), Casa+Estado (`reservas/nueva` paso 1), Cotización+Tipo de pago (`pago/page.tsx`), Desde/Hasta. Todos los demás pares ambiguos evaluados (Teléfono+Plataforma, Tipo de pago+Quién pagó, Fecha del pago+Destinatario, Banco destino+N° operación, Fecha+Pagado por, Destinatario+Banco origen+N° operación) quedan en 1 columna. *(Feature responsive, 2026-06-26, gate de Designer.)*
- **Calendario y tablas: el scroll horizontal que ya tienen alcanza** — no se rediseñan a otro patrón mobile. *(Feature responsive, 2026-06-26.)*
- **Header en mobile: menú hamburguesa** (`MobileMenuButton` + `MobileMenuPanel`), no un patrón distinto. *(Feature responsive, 2026-06-26.)*
- **Breakpoints estándar de Tailwind, sin mínimo especial por dispositivo.** *(Feature responsive, 2026-06-26.)*

## Autenticación

- **Supabase Auth, mismo nivel de acceso para los 5 titulares** — el login solo identifica quién hizo cada acción, no restringe funcionalidad entre titulares. *(Feature auth-header, 2026-06-26.)*
- **Cuentas pre-creadas a mano por Mili, sin alta pública (sin registro self-service).** *(Feature auth-header, 2026-06-26.)*

## Dominio — reservas y cuenta Paola

- **Las reservas de Airbnb no tienen seña — todo se paga al check-in.** *(Feature cuenta-paola, 2026-06-28, regla de negocio detectada al armar datos simulados.)*
- **Una reserva `confirmada` con $0 cobrado no puede existir** (nunca podría haberse iniciado sin al menos la seña, salvo Airbnb que se paga en el check-in). *(Feature cuenta-paola, 2026-06-28.)*
- **En el saldo de cuenta-paola, positivo siempre significa "el negocio le debe a Paola"** — convención de signo fija, sin ambigüedad. *(Commit `5680e6d`, feature cuenta-paola.)*
- **El cierre de comisión/gastos de Paola es "desde el último cierre" de cada tipo, no por mes calendario** — permite cierres tardíos no atados al día 30. *(Commit `c443bc0` + migración `005_movimiento_tipo.sql`, feature cuenta-paola.)*
