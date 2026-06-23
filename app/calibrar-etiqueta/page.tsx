"use client";

// Página de calibração: imprime uma régua em mm na mesma página 100x50mm
// landscape usada nas etiquetas, SEM nenhuma margem de compensação, pra
// descobrir exatamente qual janela física a impressora realmente imprime
// (em vez de ficar tentando valores de margem no escuro).
export default function CalibrarEtiquetaPage() {
  const marcasX = Array.from({ length: 21 }, (_, i) => i * 5); // 0,5,...,100
  const marcasY = Array.from({ length: 11 }, (_, i) => i * 5); // 0,5,...,50

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: Arial, sans-serif; background: #666; }

        .toolbar {
          position: sticky; top: 0; padding: 12px 20px; background: #111; color: #fff;
          display: flex; align-items: center; gap: 12px; font-size: 13px;
        }
        .btn-print {
          padding: 7px 16px; border-radius: 4px; border: none;
          background: #3dffa0; color: #000; font-weight: 700; cursor: pointer; font-size: 12px;
        }

        .wrap { padding: 24px; display: flex; justify-content: center; }

        .pagina {
          position: relative;
          width: 100mm; height: 50mm;
          background: #fff;
          outline: 1px dashed #f00;
          box-shadow: 0 4px 16px rgba(0,0,0,.4);
        }
        .tick-x {
          position: absolute; top: 0; bottom: 0; width: 0;
          border-left: 0.3mm solid #000;
        }
        .tick-x.maior { border-left: 0.5mm solid #000; }
        .label-x {
          position: absolute; top: 1mm; font-size: 7pt; font-family: 'Courier New', monospace;
          color: #000; transform: translateX(-50%);
        }
        .tick-y {
          position: absolute; left: 0; right: 0; height: 0;
          border-top: 0.3mm solid #000;
        }
        .label-y {
          position: absolute; left: 1mm; font-size: 7pt; font-family: 'Courier New', monospace;
          color: #000;
        }

        @media print {
          .toolbar { display: none !important; }
          @page { size: 100mm 50mm landscape; margin: 0; }
          html, body { background: #fff; width: 100mm; height: 50mm; }
          .wrap { padding: 0; }
          .pagina { outline: none; box-shadow: none; }
        }
      `}</style>

      <div className="toolbar">
        <div style={{ flex: 1 }}>
          Calibração de impressão — régua de 0 a 100mm (horizontal) e 0 a 50mm (vertical), sem nenhuma margem de compensação.
          Imprima e veja quais números aparecem na etiqueta física.
        </div>
        <button className="btn-print" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>

      <div className="wrap">
        <div className="pagina">
          {marcasX.map(mm => (
            <div key={"tx" + mm} className={"tick-x" + (mm % 10 === 0 ? " maior" : "")} style={{ left: mm + "mm" }} />
          ))}
          {marcasX.filter(mm => mm % 10 === 0).map(mm => (
            <div key={"lx" + mm} className="label-x" style={{ left: mm + "mm" }}>{mm}</div>
          ))}
          {marcasY.map(mm => (
            <div key={"ty" + mm} className="tick-y" style={{ top: mm + "mm" }} />
          ))}
          {marcasY.filter(mm => mm % 10 === 0).map(mm => (
            <div key={"ly" + mm} className="label-y" style={{ top: mm + "mm" }}>{mm}</div>
          ))}
        </div>
      </div>
    </>
  );
}
