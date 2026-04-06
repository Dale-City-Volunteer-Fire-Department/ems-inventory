import { useState, useEffect } from 'react';
import { useAuth, type AuthUser } from '../hooks/useAuth';

type Station = { id: number; name: string };
type View = 'main' | 'pin' | 'magic-link';

export default function Login() {
  const { login } = useAuth();
  const [view, setView] = useState<View>('main');

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-neutral-950 text-white p-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        <img src="/dcvfd-logo.svg" alt="DCVFD" className="h-20 w-auto mb-4" />
        <h1 className="text-2xl font-bold mb-1">DCVFD EMS Inventory</h1>
        <p className="text-neutral-400 text-sm mb-10">Dale City Volunteer Fire Department</p>

        {view === 'main' && <MainButtons onSelect={setView} />}
        {view === 'pin' && <PinForm onBack={() => setView('main')} onLogin={login} />}
        {view === 'magic-link' && <MagicLinkForm onBack={() => setView('main')} />}
      </div>

      <p className="absolute bottom-6 text-xs text-neutral-600 text-center">
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
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-dcvfd px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-dcvfd-light active:bg-dcvfd-dark min-h-[48px]"
      >
        <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
          <rect x="1" y="1" width="9" height="9" fill="#F25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
          <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
          <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
        </svg>
        Sign in with Entra ID
      </a>

      <button
        type="button"
        onClick={() => onSelect('magic-link')}
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-neutral-800 px-6 py-3.5 text-base font-semibold text-white border border-neutral-700 transition-colors hover:bg-neutral-750 active:bg-neutral-700 min-h-[48px]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        Magic Link
      </button>

      <button
        type="button"
        onClick={() => onSelect('pin')}
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-neutral-800 px-6 py-3.5 text-base font-semibold text-white border border-neutral-700 transition-colors hover:bg-neutral-750 active:bg-neutral-700 min-h-[48px]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        Station PIN
      </button>
    </div>
  );
}

const STATION_NAMES: Record<number, string> = {
  10: 'The Dime',
  13: 'Midtown',
  18: 'Station 18',
  20: 'Parkway Express',
};

function PinForm({ onBack, onLogin }: { onBack: () => void; onLogin: (user: AuthUser) => void }) {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/stations')
      .then((r) => r.json())
      .then((data: { stations?: Station[] }) => {
        if (data.stations) setStations(data.stations);
      })
      .catch(() => setError('Failed to load stations'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStation) {
      setError('Select a station');
      return;
    }
    if (!pin) {
      setError('Enter PIN');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ pin, stationId: selectedStation }),
      });
      const data = (await res.json()) as {
        user?: { id: number; name: string; role: string; stationId: number };
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Invalid PIN');
        return;
      }
      if (data.user) {
        onLogin({
          role: data.user.role as AuthUser['role'],
          name: data.user.name,
          email: '',
          stationId: data.user.stationId,
        });
      }
    } catch {
      setError('Connection error — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {stations.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedStation(s.id)}
            className={`flex flex-col items-center justify-center rounded-xl border-2 p-4 min-h-[80px] transition-all ${
              selectedStation === s.id
                ? 'border-dcvfd-accent bg-dcvfd/20 text-white'
                : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-500'
            }`}
          >
            <span className="text-2xl font-bold">{s.id}</span>
            <span className="text-xs mt-0.5">{STATION_NAMES[s.id] ?? s.name}</span>
          </button>
        ))}
      </div>

      <input
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="Station PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        maxLength={8}
        autoFocus
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-3.5 text-center text-2xl tracking-widest text-white placeholder:text-neutral-500 focus:border-dcvfd-accent focus:outline-none min-h-[56px]"
      />

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || !selectedStation || !pin}
        className="flex w-full items-center justify-center rounded-lg bg-dcvfd px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-dcvfd-light active:bg-dcvfd-dark disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>

      <button type="button" onClick={onBack} className="w-full text-sm text-neutral-500 hover:text-neutral-300 py-2">
        ← Back
      </button>
    </form>
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
        <div className="text-4xl">📬</div>
        <p className="text-white font-semibold">Check your email</p>
        <p className="text-neutral-400 text-sm">
          A sign-in link was sent to <span className="text-white">{email}</span>
        </p>
        <button type="button" onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-300 py-2">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <p className="text-neutral-400 text-sm text-center">Enter your email and we'll send a sign-in link.</p>

      <input
        type="email"
        placeholder="you@dcvfd.org"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
        required
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-3.5 text-white placeholder:text-neutral-500 focus:border-dcvfd-accent focus:outline-none min-h-[48px]"
      />

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || !email}
        className="flex w-full items-center justify-center rounded-lg bg-dcvfd px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-dcvfd-light active:bg-dcvfd-dark disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
      >
        {loading ? 'Sending…' : 'Send Link'}
      </button>

      <button type="button" onClick={onBack} className="w-full text-sm text-neutral-500 hover:text-neutral-300 py-2">
        ← Back
      </button>
    </form>
  );
}
