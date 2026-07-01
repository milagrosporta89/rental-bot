-- Schema completo de Temporalias — equivale a correr las migraciones 001 a 007 en orden.
-- Usar para levantar una base de datos nueva desde cero (nuevo entorno, disaster recovery, etc.).
-- Seguro correrlo varias veces (IF NOT EXISTS en tablas e índices; ADD COLUMN IF NOT EXISTS).
-- NO reemplaza correr las migraciones individuales en una base ya existente — usarlas en orden.

-- ============================================================
-- TABLAS ORIGINALES (creadas por el bot, incluidas acá para
-- que este archivo sea autosuficiente)
-- ============================================================

CREATE TABLE IF NOT EXISTS reservas (
  id                  TEXT      PRIMARY KEY,
  fecha_registro      TEXT      NOT NULL,
  casa                TEXT      NOT NULL,
  titular             TEXT      NOT NULL,
  nombre_pax          TEXT      NOT NULL,
  cantidad_pax        INTEGER   NOT NULL,
  cantidad_noches     INTEGER   NOT NULL,
  fecha_entrada       TEXT      NOT NULL,   -- DD/MM/YYYY
  fecha_salida        TEXT      NOT NULL,   -- DD/MM/YYYY
  monto_total_usd     NUMERIC   NOT NULL,
  monto_adelanto_ars  NUMERIC,
  monto_adelanto_usd  NUMERIC,
  saldo_usd           NUMERIC   NOT NULL,
  estado_pago         TEXT      NOT NULL,
  comprobante_url     TEXT,
  registrado_por      TEXT      NOT NULL,
  timestamp           TEXT      NOT NULL,
  cotizacion          NUMERIC   NOT NULL DEFAULT 0,
  plataforma          TEXT      NOT NULL DEFAULT 'directo',
  -- Agregado por migración 001
  estado_reserva      TEXT      NOT NULL DEFAULT 'confirmada'
    CHECK (estado_reserva IN ('tentativa', 'confirmada', 'cancelada')),
  notas               TEXT,
  telefono            TEXT
);

CREATE TABLE IF NOT EXISTS ingresos (
  id                      TEXT    PRIMARY KEY,
  fecha                   TEXT    NOT NULL,   -- DD/MM/YYYY
  casa                    TEXT    NOT NULL,
  monto                   NUMERIC NOT NULL,
  moneda                  TEXT    NOT NULL,
  tipo                    TEXT,
  quien_pago              TEXT,
  nombre_destinatario     TEXT,
  banco_destino           TEXT,
  nro_operacion           TEXT,
  detalle                 TEXT,
  registrado_por          TEXT    NOT NULL,
  comprobante_url         TEXT,
  timestamp               TEXT    NOT NULL,
  cotizacion              NUMERIC NOT NULL DEFAULT 0,
  monto_ars               NUMERIC,
  monto_usd               NUMERIC,
  id_reserva              TEXT,
  tipo_movimiento         TEXT,
  -- Agregado por migración 004
  resolucion_cancelacion  TEXT
    CHECK (resolucion_cancelacion IN ('comision', 'caja_chica'))
);

CREATE TABLE IF NOT EXISTS gastos (
  id                  TEXT    PRIMARY KEY,
  fecha               TEXT    NOT NULL,   -- DD/MM/YYYY
  monto               NUMERIC NOT NULL,
  moneda              TEXT    NOT NULL,
  categoria           TEXT    NOT NULL,
  pagado_por          TEXT    NOT NULL,
  nombre_destinatario TEXT,
  banco_origen        TEXT,
  nro_operacion       TEXT,
  detalle             TEXT,
  registrado_por      TEXT    NOT NULL,
  comprobante_url     TEXT,
  timestamp           TEXT    NOT NULL,
  cotizacion          NUMERIC NOT NULL DEFAULT 0,
  monto_ars           NUMERIC,
  monto_usd           NUMERIC,
  -- Agregado por migración 007
  id_reserva          TEXT
);

-- ============================================================
-- TABLAS NUEVAS (creadas por las migraciones)
-- ============================================================

-- migración 001
CREATE TABLE IF NOT EXISTS bloqueos (
  id            TEXT        PRIMARY KEY,
  casa          TEXT        NOT NULL,
  fecha_desde   TEXT        NOT NULL,   -- DD/MM/YYYY
  fecha_hasta   TEXT        NOT NULL,   -- DD/MM/YYYY
  motivo        TEXT        NOT NULL
    CHECK (motivo IN ('limpieza', 'mantenimiento', 'uso_personal', 'otro')),
  notas         TEXT,
  registrado_por TEXT       NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- migraciones 004 + 005 + 006
CREATE TABLE IF NOT EXISTS movimientos_internos (
  id              TEXT    PRIMARY KEY,
  fecha           TEXT    NOT NULL,   -- DD/MM/YYYY
  monto           NUMERIC NOT NULL,
  moneda          TEXT    NOT NULL CHECK (moneda IN ('ARS', 'USD')),
  cotizacion      NUMERIC NOT NULL DEFAULT 0,
  monto_ars       NUMERIC,
  monto_usd       NUMERIC,
  sentido         TEXT    NOT NULL CHECK (sentido IN ('a_favor_paola', 'a_favor_negocio')),
  tipo            TEXT    NOT NULL DEFAULT 'ajuste_libre'
    CHECK (tipo IN ('cierre_comision', 'reembolso_gastos', 'caja_chica', 'ajuste_libre')),
  cuenta_origen   TEXT,
  detalle         TEXT,
  comprobante_url TEXT,
  registrado_por  TEXT    NOT NULL,
  timestamp       TEXT    NOT NULL
);

-- ============================================================
-- ÍNDICES
-- ============================================================

-- migración 001
CREATE INDEX IF NOT EXISTS idx_bloqueos_casa
  ON bloqueos (casa);

CREATE INDEX IF NOT EXISTS idx_reservas_estado_reserva
  ON reservas (estado_reserva);

CREATE INDEX IF NOT EXISTS idx_reservas_casa_fechas
  ON reservas (casa, fecha_entrada, fecha_salida);

-- migración 002
CREATE UNIQUE INDEX IF NOT EXISTS ingresos_nro_operacion_unique
  ON ingresos (nro_operacion)
  WHERE nro_operacion IS NOT NULL AND nro_operacion <> '';

-- migración 003
CREATE UNIQUE INDEX IF NOT EXISTS gastos_nro_operacion_unique
  ON gastos (nro_operacion)
  WHERE nro_operacion IS NOT NULL AND nro_operacion <> '';
