"use client";

import { useEscToClose } from "./useEscToClose";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  width: number | string;
  style?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, width, style, headerStyle, children }: ModalProps) {
  useEscToClose(open, onClose);
  if (!open) return null;
  return (
    <div className="mov open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mod" style={{ width, ...style }}>
        <div className="mhd" style={headerStyle}>
          <span className="mtit">{title}</span>
          <button className="mcl" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
