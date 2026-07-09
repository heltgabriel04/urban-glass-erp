"use client";

import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--t3)", marginBottom: "8px", flexWrap: "wrap" }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {i > 0 && <span style={{ color: "var(--t3)" }}>›</span>}
          {item.href ? (
            <Link href={item.href} style={{ color: "var(--t3)", textDecoration: "none" }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--acc)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; }}>
              {item.label}
            </Link>
          ) : (
            <span style={{ color: "var(--t2)", fontWeight: 600 }}>{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
