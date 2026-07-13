-- El excedente que separa partirIngresoPorExcedente queda vinculado por id al ingreso original
-- (el pago real), en vez de depender solo del texto libre de "detalle" (que se puede editar/
-- borrar) — mismo criterio que 007_gasto_id_reserva.sql.
-- Nullable: solo lo usan las filas de excedente que crea el split; el resto de los ingresos no
-- tiene un ingreso "padre".
ALTER TABLE ingresos
  ADD COLUMN IF NOT EXISTS id_ingreso_origen TEXT;
