export default function App() {
  return (
    <div
      style={{
        background: '#080c14',
        color: '#e2e8f0',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            background: 'linear-gradient(120deg, #fff 30%, #22d3ee 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Anti_GV
        </h1>
        <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>AI IDE — Ready to build</p>
      </div>
    </div>
  );
}
