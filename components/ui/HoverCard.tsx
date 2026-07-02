"use client";

import { useRef, useState, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

interface HoverCardProps {
  content: ReactNode;
  children: ReactElement;
  delayMs?: number;
}

const CARD_W = 260;
const CARD_MAX_H = 320;

// Tooltip genérico ao passar o mouse — não usa portal nem lib externa
// (nenhuma existe no projeto). Injeta os handlers direto no filho via
// cloneElement em vez de envolver num <div>, pra não interferir em
// elementos posicionados via position:absolute/draggable (ex.: blocos do
// Gantt) que dependem do próprio pai de layout.
export default function HoverCard({ content, children, delayMs = 300 }: HoverCardProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }

  function handleEnter(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    clearTimer();
    timer.current = setTimeout(() => setPos({ x: rect.left, y: rect.bottom + 6 }), delayMs);
  }

  function handleLeave() {
    clearTimer();
    setPos(null);
  }

  if (!isValidElement(children)) return children;

  const childProps = children.props as Record<string, any>;
  const child = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => { childProps.onMouseEnter?.(e); handleEnter(e); },
    onMouseLeave: (e: React.MouseEvent) => { childProps.onMouseLeave?.(e); handleLeave(); },
  } as any);

  let left = pos?.x ?? 0;
  let top  = pos?.y ?? 0;
  if (pos && typeof window !== "undefined") {
    if (left + CARD_W > window.innerWidth - 8)     left = Math.max(8, window.innerWidth - CARD_W - 8);
    if (top + CARD_MAX_H > window.innerHeight - 8) top = Math.max(8, pos.y - CARD_MAX_H - 12);
  }

  return (
    <>
      {child}
      {pos && (
        <div style={{
          position: "fixed", left, top, width: CARD_W, maxHeight: CARD_MAX_H,
          overflowY: "auto", zIndex: 1000,
          background: "var(--surf3)", border: "1px solid var(--b2)",
          borderRadius: "var(--r)", boxShadow: "var(--sh2)",
          padding: "10px 12px", pointerEvents: "none",
        }}>
          {content}
        </div>
      )}
    </>
  );
}
