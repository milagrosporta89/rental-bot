export interface Metricas {
  resumen: {
    totalIngresosARS: number;
    totalGastosARS: number;
    balanceNeto: number;
    totalOperaciones: number;
  };
  porMes: { mes: string; ingresos: number; gastos: number; balance: number }[];
  porCasa: { casa: string; ingresos: number; gastos: number; balance: number }[];
  porCategoria: { categoria: string; total: number }[];
  porTipo: { tipo: string; total: number }[];
  saldosActuales: { fecha: string; titular: string; monto: number; timestamp: string }[];
}

export interface DashboardData {
  metricas: Metricas;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
