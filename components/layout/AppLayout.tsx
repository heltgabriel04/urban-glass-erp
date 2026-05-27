import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

interface Props {
  children: React.ReactNode;
}

export default function AppLayout({
  children,
}: Props) {
  return (
    <div className="erp-layout">
      <Sidebar />

      <div className="erp-content">
        <Topbar />

        <main className="erp-main">
          {children}
        </main>
      </div>
    </div>
  );
}