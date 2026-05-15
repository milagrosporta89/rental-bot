import { useEffect, useState, useRef, KeyboardEvent } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { DashboardData, ChatMessage } from "./types";

const ARS = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-AR");

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#be185d", "#065f46"];

const MES_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};
function fmtMes(key: string) {
  const [anio, mes] = key.split("-");
  return `${MES_LABELS[mes] ?? mes} ${anio.slice(2)}`;
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError("No se pudo conectar con el servidor"); setLoading(false); });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || chatLoading) return;
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const { reply } = await res.json();
      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Hubo un error. Intentá de nuevo." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
  }

  if (loading) return <div className="spinner">Cargando datos…</div>;
  if (error || !data) return <div className="error">{error ?? "Sin datos"}</div>;

  const { metricas: m } = data;

  return (
    <div className="app">
      <div className="header">
        <h1>Dashboard Alquileres</h1>
      </div>

      {/* KPIs */}
      <div className="kpis">
        <div className="kpi positivo">
          <div className="label">Ingresos totales</div>
          <div className="value">{ARS(m.resumen.totalIngresosARS)}</div>
        </div>
        <div className="kpi negativo">
          <div className="label">Gastos totales</div>
          <div className="value">{ARS(m.resumen.totalGastosARS)}</div>
        </div>
        <div className={`kpi ${m.resumen.balanceNeto >= 0 ? "positivo" : "negativo"}`}>
          <div className="label">Balance neto</div>
          <div className="value">{ARS(m.resumen.balanceNeto)}</div>
        </div>
        <div className="kpi azul">
          <div className="label">Operaciones</div>
          <div className="value">{m.resumen.totalOperaciones}</div>
        </div>
      </div>

      <div className="charts">
        {/* Evolución mensual */}
        <div className="card full">
          <h2>Evolución mensual</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={m.porMes.map((d) => ({ ...d, mes: fmtMes(d.mes) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => "$" + (v / 1000).toFixed(0) + "k"} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => ARS(v)} />
              <Legend />
              <Bar dataKey="ingresos" name="Ingresos" fill="#2563eb" radius={[3, 3, 0, 0]} />
              <Bar dataKey="gastos" name="Gastos" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Ingresos por casa */}
        <div className="card">
          <h2>Ingresos por casa</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={m.porCasa} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={(v) => "$" + (v / 1000).toFixed(0) + "k"} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="casa" tick={{ fontSize: 12 }} width={60} />
              <Tooltip formatter={(v: number) => ARS(v)} />
              <Bar dataKey="ingresos" name="Ingresos" fill="#2563eb" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gastos por categoría */}
        <div className="card">
          <h2>Gastos por categoría</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={m.porCategoria}
                dataKey="total"
                nameKey="categoria"
                cx="50%" cy="50%"
                outerRadius={80}
                label={({ categoria, percent }) =>
                  `${categoria} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {m.porCategoria.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => ARS(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Saldos reales */}
        {m.saldosActuales.length > 0 && (
          <div className="card">
            <h2>Saldos reales (último reporte)</h2>
            {m.saldosActuales.map((s) => (
              <div key={s.titular} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ fontWeight: 500 }}>{s.titular}</span>
                <span style={{ color: "#16a34a", fontWeight: 600 }}>{ARS(s.monto)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="card">
        <h2>Consultá los datos</h2>
        <div className="chat-messages">
          {messages.length === 0 && (
            <div style={{ color: "#aaa", fontSize: 13, textAlign: "center", marginTop: 40 }}>
              Preguntá lo que quieras sobre los datos del negocio
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>{m.content}</div>
          ))}
          {chatLoading && <div className="msg assistant loading">Pensando…</div>}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-input">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="¿Cuánto ingresó la Casa 1 en abril?"
            disabled={chatLoading}
          />
          <button onClick={sendMessage} disabled={chatLoading || !input.trim()}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
