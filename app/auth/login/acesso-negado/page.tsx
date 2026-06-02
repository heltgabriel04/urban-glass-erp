"use client";

export default function AcessoNegado() {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0d0d14",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      gap: "16px",
      padding: "24px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "48px" }}>🔒</div>
      <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff" }}>
        Acesso restrito
      </div>
      <div style={{ fontSize: "14px", color: "rgba(255,255,255,.4)", maxWidth: "280px" }}>
        Seu usuário só tem acesso à área de produção.<br />
        Escaneie o QR code de uma etiqueta para continuar.
      </div>
    </div>
  );
}