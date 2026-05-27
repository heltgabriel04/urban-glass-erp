"use client";

import {
  LineChart,
  Line,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { month: "Jan", revenue: 18000 },
  { month: "Fev", revenue: 24000 },
  { month: "Mar", revenue: 32000 },
  { month: "Abr", revenue: 28000 },
  { month: "Mai", revenue: 41000 },
  { month: "Jun", revenue: 52000 },
];

export default function RevenueChart() {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3>Faturamento</h3>

        <span>Últimos 6 meses</span>
      </div>

      <ResponsiveContainer
        width="100%"
        height={320}
      >
        <LineChart data={data}>
          <XAxis dataKey="month" />

          <Tooltip />

          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#00ffaa"
            strokeWidth={3}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}