-- "Cuenta de Paola": el cierre pasa de ser "por mes calendario" a "desde el último cierre".
-- Para eso movimientos_internos necesita distinguir DE QUÉ es cada ajuste, porque solo uno
-- de los tipos genera un gasto espejo en /gastos (ver actions/movimientosInternos.ts):
--   - cierre_comision:   comisión devengada y nunca cobrada -> SÍ genera gasto espejo.
--   - reembolso_gastos:  gastos que Paola ya pagó de su bolsillo (ya están en /gastos con su
--                        categoría real) -> NO genera gasto nuevo, sería contarlo dos veces.
--   - caja_chica:        ya existe (US-06, cobros de reservas canceladas) -> no genera gasto.
--   - ajuste_libre:       cualquier otro caso suelto, vía el botón "Registrar movimiento".
ALTER TABLE movimientos_internos
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'ajuste_libre'
    CHECK (tipo IN ('cierre_comision', 'reembolso_gastos', 'caja_chica', 'ajuste_libre'));
