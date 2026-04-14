export default function Login() {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center text-white p-6 bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: "url('/login-bg.jpg')" }}
    >
      {/* Gradient overlay — dark bottom for legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/80 pointer-events-none" />

      <div className="w-full max-w-sm flex flex-col items-center relative z-10">
        {/* Glass card */}
        <div className="w-full glass rounded-2xl p-8 flex flex-col items-center shadow-2xl">
          <img src="/dcvfd-badge.svg" alt="DCVFD" className="h-24 w-auto mb-5 drop-shadow-lg" />
          <h1 className="text-2xl font-bold tracking-tight mb-0.5">EMS Inventory</h1>
          <p className="text-zinc-400 text-sm mb-8">Dale City Volunteer Fire Department</p>

          <div className="w-full space-y-3">
            <a
              href="/api/auth/entra/login"
              onClick={(e) => { e.preventDefault(); window.location.href = '/api/auth/entra/login'; }}
              className="group flex w-full items-center justify-center gap-3 rounded-xl bg-dcvfd px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light hover:shadow-dcvfd/30 active:bg-dcvfd-dark active:scale-[0.98] min-h-[52px] transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 21 21" fill="none" className="shrink-0">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
              <span>DCVFD Personnel</span>
            </a>
          </div>
        </div>
      </div>

      <p className="absolute bottom-6 text-xs text-zinc-600 text-center z-10">
        &copy; 2026 Dale City Volunteer Fire Department, Inc.
      </p>
    </div>
  );
}
