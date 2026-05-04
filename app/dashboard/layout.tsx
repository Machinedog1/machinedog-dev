export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      
      {/* Sidebar */}
      <div style={{
        width: "250px",
        background: "#111",
        color: "white",
        padding: "20px"
      }}>
        <h2>MachineDog</h2>

        <button style={{
          width: "100%",
          marginTop: "20px",
          padding: "10px",
          background: "green",
          color: "white"
        }}>
          + New Project
        </button>

        <div style={{ marginTop: "20px" }}>
          <div>project-1</div>
          <div>project-2</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: "20px" }}>
        {children}
      </div>

    </div>
  );
}