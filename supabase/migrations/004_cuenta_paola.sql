-- Feature "Cuenta de Paola": cuenta corriente de comisiones/caja chica.
-- Ejecutar en Supabase → SQL Editor. Seguro correrlo varias veces (IF NOT EXISTS).

-- 1. Tabla de ajustes manuales entre Paola y el negocio (transferencias reales
--    hechas para saldar diferencias — comisión devengada vs cobrada, reembolsos, etc.)
CREATE TABLE IF NOT EXISTS movimientos_internos (
  id              TEXT        PRIMARY KEY,
  fecha           TEXT        NOT NULL,  -- DD/MM/YYYY
  monto           NUMERIC     NOT NULL,
  moneda          TEXT        NOT NULL CHECK (moneda IN ('ARS', 'USD')),
  cotizacion      NUMERIC     NOT NULL DEFAULT 0,
  monto_ars       NUMERIC,
  monto_usd       NUMERIC,
  sentido         TEXT        NOT NULL CHECK (sentido IN ('a_favor_paola', 'a_favor_negocio')),
  detalle         TEXT,
  comprobante_url TEXT,
  registrado_por  TEXT        NOT NULL,
  timestamp       TEXT        NOT NULL
);

-- 2. Clasificación manual de cobros de Paola en reservas que se cancelaron
--    (NULL = pendiente de decidir).
ALTER TABLE ingresos
  ADD COLUMN IF NOT EXISTS resolucion_cancelacion TEXT
    CHECK (resolucion_cancelacion IN ('comision', 'caja_chica'));
