"use client";

import Sparkline from "./Sparkline";

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  variant?: "hero" | "default";
  trend?: { percent: number; label: string };
  sparkline?: number[];
  valueColor?: string;
}

export default function MetricCard({ label, value, sub, variant = "default", trend, sparkline, valueColor }: MetricCardProps) {
  const isHero = variant === "hero";
  const trendPositivo = trend ? trend.percent >= 0 : true;

  return (
    <div className={`metric-card${isHero ? " hero" : ""}`}>
      <div className="mc-label">{label}</div>
      <div className="mc-value" style={!isHero && valueColor ? { color: valueColor } : undefined}>{value}</div>
      {sub && <div className="mc-sub">{sub}</div>}
      {trend && (
        <div className="mc-trend" style={{ color: trendPositivo ? "var(--ok)" : "var(--err)" }}>
          {trendPositivo ? "▲" : "▼"} {Math.abs(trend.percent).toFixed(0)}% {trend.label}
        </div>
      )}
      {sparkline && sparkline.length > 1 && (
        <div className="mc-sparkline">
          <Sparkline data={sparkline} tone={trendPositivo ? "positive" : "negative"} />
        </div>
      )}
    </div>
  );
}
