-- "Cuenta de Paola": registrar de qué cuenta (de qué titular) salió/entró realmente la plata
-- en cada movimiento_interno. Sin esto, una transferencia real de Fernando a Paola (ej. el
-- reembolso de gastos, que no genera gasto espejo a propósito) queda sin ningún rastro de que
-- salió de SU cuenta — con el tiempo el saldo calculado de esa cuenta se desfasa de la realidad.
-- Nullable y sin CHECK (mismo criterio que gastos.pagado_por): es una lista sugerida en la UI,
-- no una restricción dura en la base.
ALTER TABLE movimientos_internos
  ADD COLUMN IF NOT EXISTS cuenta_origen TEXT;
