-- Evita registrar dos veces el mismo comprobante de gasto.
-- Parcial: solo aplica cuando nro_operacion tiene valor (carga manual queda excluida).
CREATE UNIQUE INDEX IF NOT EXISTS gastos_nro_operacion_unique
  ON gastos (nro_operacion)
  WHERE nro_operacion IS NOT NULL AND nro_operacion <> '';
