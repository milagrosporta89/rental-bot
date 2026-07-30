// Diferencias de hasta USD 1 son redondeo de cotización, no un saldo real pendiente (o a favor)
// — sin esto una reserva con centavos de diferencia queda marcada "parcial"/"debe" para siempre.
// Fuente única: cualquier lugar que calcule saldo_usd (registrar pago, crear o editar reserva)
// tiene que pasar por acá para no repetir el bug de un residuo que nunca llega a 0.
export function redondearSaldo(saldo: number): number {
  return Math.abs(saldo) <= 1 ? 0 : saldo
}
