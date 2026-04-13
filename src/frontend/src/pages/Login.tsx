import { useState } from 'react';

type View = 'main' | 'magic-link';

export default function Login() {
  const [view, setView] = useState<View>('main');

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

          {view === 'main' && <MainButtons onSelect={setView} />}
          {view === 'magic-link' && <MagicLinkForm onBack={() => setView('main')} />}
        </div>
      </div>

      <p className="absolute bottom-6 text-xs text-zinc-600 text-center z-10">
        &copy; 2026 Dale City Volunteer Fire Department, Inc.
      </p>
    </div>
  );
}

function MainButtons({ onSelect }: { onSelect: (v: View) => void }) {
  return (
    <div className="w-full space-y-3">
      <a
        href="/api/auth/entra/login"
        onClick={(e) => {
          e.preventDefault();
          window.location.href = '/api/auth/entra/login';
        }}
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

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-zinc-700" />
        <span className="text-xs text-zinc-500 uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-zinc-700" />
      </div>

      <button
        type="button"
        onClick={() => onSelect('magic-link')}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-surface-overlay px-6 py-3.5 text-base font-semibold text-white border border-border-subtle hover:bg-zinc-800 hover:border-zinc-600 active:bg-zinc-700 active:scale-[0.98] min-h-[52px] transition-all"
      >
        <svg className="h-5 w-5 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <span>PWC Employees</span>
      </button>
      <p className="text-xs text-zinc-500 text-center">Prince William County staff &mdash; sign in via email link</p>
    </div>
  );
}

function MagicLinkForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Request failed');
      }
    } catch {
      setError('Connection error — try again');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-dcvfd/20 border border-dcvfd-accent/30 flex items-center justify-center">
          <svg className="h-8 w-8 text-dcvfd-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div>
          <p className="text-white font-semibold">Check your email</p>
          <p className="text-zinc-400 text-sm mt-1">
            A sign-in link was sent to <span className="text-white font-medium">{email}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-zinc-500 hover:text-zinc-300 py-2 transition-colors"
        >
          &larr; Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <p className="text-zinc-400 text-sm text-center">Enter your county email and we'll send a sign-in link.</p>

      <input
        type="email"
        placeholder="you@pwcgov.org"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
        required
        className="w-full rounded-xl bg-surface-overlay border border-border-subtle px-4 py-3.5 text-white placeholder:text-zinc-500 focus:border-dcvfd-accent focus:ring-1 focus:ring-dcvfd-accent/30 focus:outline-none min-h-[52px] transition-all"
      />

      {error && (
        <div className="rounded-lg bg-red-950/50 border border-red-900/50 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading || !email}
        className="flex w-full items-center justify-center rounded-xl bg-dcvfd px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light active:bg-dcvfd-dark active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none min-h-[52px] transition-all"
      >
        {loading ? (
          <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          'Send Link'
        )}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-zinc-500 hover:text-zinc-300 py-2 transition-colors"
      >
        &larr; Back to sign in
      </button>
    </form>
  );
}
