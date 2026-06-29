-- "Cuenta de Paola": el gasto de comisión que genera el gatillo (US-04) queda vinculado por id
-- a la reserva que lo originó, en vez de depender solo del texto libre de "detalle" (que se
-- puede editar/borrar). Decisión revisada por Mili — originalmente se había descartado.
-- Nullable: solo lo usa el gatillo de comisión, el resto de los gastos no tiene reserva asociada.
ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS id_reserva TEXT;
