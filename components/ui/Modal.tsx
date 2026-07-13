"use client";

import { useEscToClose } from "./useEscToClose";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  width: number | string;
  style?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  backdropStyle?: React.CSSProperties;
  dismissible?: boolean;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, width, style, headerStyle, backdropStyle, dismissible, children }: ModalProps) {
  const podeFechar = dismissible !== false;
  useEscToClose(open && podeFechar, onClose);
  if (!open) return null;
  return (
    <div className="mov open" onClick={e => podeFechar && e.target === e.currentTarget && onClose()} style={backdropStyle}>
      <div className="mod" style={{ width, ...style }}>
        {title !== undefined && (
          <div className="mhd" style={headerStyle}>
            <span className="mtit">{title}</span>
            {podeFechar && <button className="mcl" aria-label="Fechar" onClick={onClose}>✕</button>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
