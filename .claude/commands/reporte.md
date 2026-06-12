# Reporte – Generador de reportes legibles

Generá el archivo `scripts/generar-reporte.ts` y ejecutalo con `npx tsx scripts/generar-reporte.ts` para producir `reporte.html`. No leas código del proyecto — todo lo que necesitás está en este skill.

---

## Datos del negocio

- 5 casas de alquiler temporal en Argentina
- Titulares por casa: Francisco → Casas 1 y 2 · Milagros → Casas 3 y 4 · Inés → Casa 5
- Paola administra y cobra comisión = 15% sobre el total de ingresos del mes anterior
- Monedas: ARS y USD. Las columnas `montoARS` y `montoUSD` ya tienen la conversión hecha (usarlas directamente)

## Conexión a Google Sheets

```ts
import { google } from "googleapis";
import * as dotenv from "dotenv";
dotenv.config();

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
```

## Estructura de hojas (índice 0-based, fila 1 = encabezado, datos desde fila 2)

**Ingresos** (`Ingresos!A:Q`):
`id(0) fecha(1) casa(2) monto(3) moneda(4) tipo(5) quienPago(6) nombreDestinatario(7) bancoOrigen(8) nroOperacion(9) detalle(10) registradoPor(11) comprobanteUrl(12) timestamp(13) cotizacion(14) montoARS(15) montoUSD(16)`

**Gastos** (`Gastos!A:P`):
`id(0) fecha(1) monto(2) moneda(3) categoria(4) pagadoPor(5) nombreDestinatario(6) bancoOrigen(7) nroOperacion(8) detalle(9) registradoPor(10) comprobanteUrl(11) timestamp(12) cotizacion(13) montoARS(14) montoUSD(15)`

**Reservas** (`Reservas!A:S`):
`id(0) fechaRegistro(1) casa(2) titular(3) nombrePax(4) cantidadPax(5) cantidadNoches(6) fechaEntrada(7) fechaSalida(8) montoTotalUSD(9) montoAdelantoARS(10) montoAdelantoUSD(11) saldoUSD(12) estadoPago(13) comprobanteUrl(14) registradoPor(15) timestamp(16) cotizacion(17) plataforma(18)`

**Comisiones** (`Comisiones!A:F`):
`mes(0) monto(1) tipo(2) descripcion(3) timestamp(4) cotizacion(5)`

---

## Qué calcular

### Mes actual vs mes anterior
- Total ingresos ARS y USD (columnas montoARS/montoUSD)
- Total gastos ARS, desglosado por categoría (campo `categoria`)
- Balance neto = ingresos - gastos
- Ingresos por casa

### Por titular (Francisco, Milagros, Inés)
- Casas que le corresponden, ingresos del mes, gastos del mes, balance

### Reservas próximas (próximos 30 días desde hoy)
- Filtrar por `fechaEntrada` dentro del rango

### Comisiones de Paola
- `baseIngresos` = suma `montoARS` de ingresos del mes anterior
- `comisionEsperada` = baseIngresos × 0.15
- `cobradoMes` = suma positiva de `monto` en Comisiones donde `mes` = mes actual
- `pendiente` = comisionEsperada − cobradoMes

### Gastos por categoría (mes actual)
Ordenados de mayor a menor por monto total

---

## Cómo generar el HTML

### Qué NO mostrar nunca
IDs, timestamps, nros de operación, CBUs, URLs de comprobantes, campos `registradoPor`, `bancoOrigen`, `nroOperacion`, `comprobanteUrl`.

### Formato de datos
- Montos ARS: `$ 45.200` · Montos USD: `u$s 320`
- Fechas: `12 jun 2025` (no `12/06/2025`)
- Categorías y tipos con mayúscula inicial: `Limpieza`, `Transferencia`
- Estado de pago de reservas: `ADELANTO_RECIBIDO` → `Adelanto recibido`, `SALDO_RECIBIDO` → `Saldo recibido`, `COMPLETO` → `Completo`

### Columnas por tabla

**Ingresos del mes:** Fecha · Propiedad · Huésped · Monto ARS · Monto USD · Forma de pago

**Gastos del mes:** Fecha · Categoría · Pagado por · Monto ARS · Detalle

**Reservas próximas:** Propiedad · Huésped · Entrada · Salida · Noches · Total USD · Estado

**Resumen por titular:** una tarjeta por titular — Ingresos ARS · Gastos ARS · Balance

**Comisiones Paola:** una sola tarjeta — Base de cálculo · Comisión esperada · Cobrado · Pendiente

### Estilo HTML
- Fondo blanco, fuente sans-serif, sin frameworks externos
- Navegación con anclas al inicio del HTML
- Tablas con filas alternas `#f9f9f9` / blanco, borde `#ddd`
- Tarjetas resumen con borde izquierdo de color (azul para ingresos, rojo para gastos, verde para balance positivo)
- Encabezado con fecha y hora de generación

---

## Ejecución

```bash
npx tsx scripts/generar-reporte.ts
```

Si hay error de credenciales, mostrarlo claramente. Al terminar decí:
"Reporte generado en `reporte.html`. Abrilo en el navegador para verlo."
