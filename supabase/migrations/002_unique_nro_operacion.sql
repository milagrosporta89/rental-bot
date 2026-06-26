-- Evita registrar dos veces el mismo comprobante de transferencia.
-- Parcial: solo aplica cuando nro_operacion tiene valor (efectivo queda excluido).
CREATE UNIQUE INDEX IF NOT EXISTS ingresos_nro_operacion_unique
  ON ingresos (nro_operacion)
  WHERE nro_operacion IS NOT NULL AND nro_operacion <> '';
