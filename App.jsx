// PHASE 2 PLACEHOLDER
//
// This is intentionally minimal. Its only job right now is to prove the
// Vite + React build pipeline works end to end (dev server, build, runtime
// config loading). The actual Nyx UI (sidebar, chat, projects, documents,
// nodes, models, search, settings, admin) is ported feature by feature in
// later phases per the migration plan, each behind its own commit/checkpoint.
//
// Do not mistake this for real progress on feature parity — nothing here
// talks to the backend yet.

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 8,
      fontFamily: 'system-ui, sans-serif',
      background: '#0a0a0f',
      color: '#f0eff8',
    }}>
      <div style={{ fontSize: 20, fontWeight: 600 }}>Nyx — Vite scaffold</div>
      <div style={{ fontSize: 13, color: '#7a7990' }}>
        Phase 2 checkpoint: build pipeline verified. No features ported yet.
      </div>
      <div style={{ fontSize: 12, color: '#4e4d62', marginTop: 8 }}>
        API target: {window.NYX_CONFIG.API_URL}
      </div>
    </div>
  );
}
