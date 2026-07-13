"use client";

import { useId, cloneElement, isValidElement, type ReactElement, type CSSProperties } from "react";

interface CampoProps {
  label: string;
  children: ReactElement;
  span2?: boolean;
  style?: CSSProperties;
}

export function Campo({ label, children, span2, style }: CampoProps) {
  const id = useId();
  const campo = isValidElement(children) ? cloneElement(children, { id } as Record<string, unknown>) : children;
  return (
    <div className="fg" style={{ gridColumn: span2 ? "1 / -1" : undefined, ...style }}>
      <label className="fl" htmlFor={id}>{label}</label>
      {campo}
    </div>
  );
}
