export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="shell">
      <div className="container">
        {children}
      </div>
    </main>
  );
}
