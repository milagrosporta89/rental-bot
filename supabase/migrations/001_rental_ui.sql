-- Migración para rental-ui (Temporalias dashboard)
-- Ejecutar en Supabase → SQL Editor
-- Seguro correrlo varias veces (IF NOT EXISTS / IF NOT EXISTS)

-- 1. Agregar columnas a reservas (el bot no las usa, el dashboard sí)
ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS estado_reserva TEXT NOT NULL DEFAULT 'confirmada'
    CHECK (estado_reserva IN ('tentativa', 'confirmada', 'cancelada')),
  ADD COLUMN IF NOT EXISTS notas TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT;

-- 2. Tabla bloqueos operativos (limpieza, mantenimiento, uso personal)
CREATE TABLE IF NOT EXISTS bloqueos (
  id           TEXT        PRIMARY KEY,
  casa         TEXT        NOT NULL,
  fecha_desde  TEXT        NOT NULL,  -- DD/MM/YYYY
  fecha_hasta  TEXT        NOT NULL,  -- DD/MM/YYYY
  motivo       TEXT        NOT NULL
    CHECK (motivo IN ('limpieza', 'mantenimiento', 'uso_personal', 'otro')),
  notas        TEXT,
  registrado_por TEXT      NOT NULL,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_bloqueos_casa ON bloqueos (casa);
CREATE INDEX IF NOT EXISTS idx_reservas_estado_reserva ON reservas (estado_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_casa_fechas ON reservas (casa, fecha_entrada, fecha_salida);
