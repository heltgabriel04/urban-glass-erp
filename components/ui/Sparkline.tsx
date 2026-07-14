"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: number[];
  tone: "positive" | "negative";
}

export default function Sparkline({ data, tone }: SparklineProps) {
  const chartData = data.map((v, i) => ({ i, v }));
  const stroke = tone === "positive" ? "var(--ok)" : "var(--err)";
  return (
    <div style={{ width: "100%", height: 24 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
