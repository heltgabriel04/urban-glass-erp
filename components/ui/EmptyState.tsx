"use client";

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

function DefaultIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="20" stroke="var(--b2)" strokeWidth="2" strokeDasharray="4 4" />
      <rect x="16" y="26" width="4" height="8" rx="1" fill="var(--t3)" />
      <rect x="22" y="20" width="4" height="14" rx="1" fill="var(--t3)" />
      <rect x="28" y="16" width="4" height="18" rx="1" fill="var(--t3)" />
    </svg>
  );
}

export default function EmptyState({ title, subtitle, icon }: EmptyStateProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, padding: "24px 0" }}>
      {icon ?? <DefaultIcon />}
      <div style={{ fontSize: 13, color: "var(--t2)", fontWeight: 600, textAlign: "center" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11.5, color: "var(--t3)", textAlign: "center", maxWidth: 260 }}>{subtitle}</div>}
    </div>
  );
}
