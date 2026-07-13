# Explore: pasar a producción

**Fecha:** 2026-07-01  
**Sin equivalente en el bot** — todo es configuración de infraestructura y features web-only.

---

## Lo que entendí del dominio

### Estado actual de prod (klkysntjfnrrbnkjzzdy.supabase.co)

| Tabla | Filas | Observación |
|---|---|---|
| `reservas` | 0 | Vacía — excelente, comisión pendiente nace en $0 |
| `ingresos` | 89 | 30 con `nombre_destinatario = 'Paola'` — todos migrados (id `ING-MIG-*`), fechas enero-junio 2026 |
| `gastos` | 90 | 28 con `pagado_por = 'Paola'` — ids nuevos (`GAS-*`), fechas marzo-junio 2026, montos reales |
| `movimientos_internos` | **no existe** | Migraciones 004-007 no corridas en prod |
| `bloqueos` | probablemente existe | Migración 001 puede estar corrida (no se verificó) |

### Schema de prod vs schema esperado

- `gastos`: falta columna `id_reserva` (migración 007)
- `ingresos`: falta columna `resolucion_cancelacion` (migración 004) — confirmado con error `42703` al consultarla
- `movimientos_internos`: tabla no existe (migraciones 004-007 sin correr)

**La app crashea si se conecta a prod ahora mismo** — `/api/cuenta-paola-data` falla con 500 en la query a `movimientos_internos`.

### Impacto de datos históricos en cuenta-paola

Con las migraciones corridas, si se conecta a prod sin filtro de fecha:
- **Comisión pendiente**: $0 (reservas vacías → reconciliación vacía) ✓
- **Cancelaciones pendientes**: 0 (sin reservas canceladas) ✓
- **Gastos pendientes de reembolso**: muestra los 28 gastos de Paola (marzo-junio 2026) — ya que `fechaUltimoCierre = null` (sin movimientos todavía) muestra TODO el histórico
- **Comisiones cobradas**: muestra los 30 ingresos migrados a Paola como si fueran comisiones cobradas (sin reserva vinculada — aparecen como orphans)

### Lo que ya funciona

- Login / logout con Supabase Auth ✓
- Middleware redirect a `/login` sin sesión ✓
- `registradoPorActual()` resuelve el titular logueado ✓
- Toda la feature de cuenta-paola (código) ✓
- Responsive UI ✓
- `@supabase/ssr` y `@supabase/supabase-js` ya instalados ✓

### Lo que NO existe todavía

- **Restablecimiento de contraseña**: no hay ninguna página `/reset-password` ni link "Olvidé mi contraseña" en el LoginForm. Supabase ya tiene `auth.resetPasswordForEmail()` disponible — solo falta el flujo de UI.
- **Cambio de contraseña**: tampoco existe (una vez adentro, no hay cómo cambiarla desde la app).
- **Cuentas de Auth en prod**: las 5 cuentas (Francisco, Milagros, Inés, Fernando, Paola) no existen en el proyecto de prod — nadie puede loggearse.
- **Storage de comprobantes**: `STORAGE_BASE_URL=http://localhost` en `.env.prod.local` → la subida/OCR de comprobantes fallaría en prod. Hay que definir dónde van los archivos (Supabase Storage u otro).
- **Deploy**: no hay configuración de deploy visible (no hay `vercel.json`, Dockerfile, etc.).

---

## Flujo actual del bot

Sin equivalente en el bot.

---

## Gaps y problemas concretos

1. **Crítico — migraciones 004-007 sin correr en prod**: la app no puede funcionar sin ellas. Orden obligatorio: 004 → 005 → 006 → 007.
2. **Crítico — cuentas de Auth**: sin las 5 cuentas nadie entra. Se crean a mano en el dashboard de Supabase (Auth → Users → Invite).
3. **Datos históricos de gastos/ingresos**: los 28 gastos y 30 ingresos pre-julio que tiene Paola como pagadora/destinataria se mezclarían con la contabilidad nueva. La solución mínima es un filtro `fecha >= '01/07/2026'` en las queries de `/api/cuenta-paola-data` para gastos e ingresos — no se tocan los datos, solo se les pone una fecha de corte en el cálculo.
4. **Password reset**: falta construir. Supabase ya lo soporta (`auth.resetPasswordForEmail` + email de reset configurado en el proyecto). Implica: link en LoginForm → página `/forgot-password` (input de email) → Supabase manda el email → usuario llega a `/reset-password?code=...` → formulario de nueva contraseña → `auth.exchangeCodeForSession` + `auth.updateUser`.
5. **Storage de comprobantes**: `http://localhost` en prod no funciona. Dos opciones: Supabase Storage (ya disponible en el proyecto), o dejar la feature deshabilitada para prod por ahora.
6. **Deploy**: definir si va a Vercel (lo más natural para Next.js) u otro lugar.

---

## Preguntas para Mili

1. Los 28 gastos de Paola (marzo-junio 2026) en prod — ¿son plata real que Paola pagó y Fernando debería reembolsarle, o son datos de prueba que hay que ignorar? (Esto define si el filtro `>= julio` alcanza, o si esos gastos también deben quedar fuera para siempre.)
2. Los 30 ingresos migrados con destinatario Paola — ¿puedo ignorarlos en cuenta-paola con el mismo filtro de fecha, o hay alguno que sí debería entrar?
3. ¿Existe un servicio de storage para comprobantes en prod, o prefiere deshabilitar esa feature por ahora?
4. ¿Ya tiene en mente un lugar para deployar (Vercel, servidor propio, otro)?
5. Para password reset: el email de "olvidé mi contraseña" lo manda Supabase automáticamente — ¿está configurado el SMTP del proyecto de prod, o hay que configurarlo?
