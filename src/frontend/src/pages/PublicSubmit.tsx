import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Station, Category } from '@shared/types';
import type { InventoryTemplateItem } from '@shared/api-responses';
import { CATEGORIES } from '@shared/categories';
import NumericInput from '../components/NumericInput';

// ── Types ─────────────────────────────────────────────────────────

interface UploadedAttachment {
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

interface SubmitResult {
  session_id: number;
  items_submitted: number;
  items_short: number;
  order_created: boolean;
}

// ── Hardcoded stations (same as useStations hook) ─────────────────

const STATIONS: Station[] = [
  { id: 10, name: 'Station 10', code: 'FS10', is_active: true },
  { id: 13, name: 'Station 13', code: 'FS13', is_active: true },
  { id: 18, name: 'Station 18', code: 'FS18', is_active: true },
  { id: 20, name: 'Station 20', code: 'FS20', is_active: true },
];

const STATION_NICKNAMES: Record<number, string> = {
  10: 'The Dime',
  13: 'Midtown',
  18: 'Station 18',
  20: 'Parkway Express',
};

// ── Steps ─────────────────────────────────────────────────────────

type Step = 'email' | 'email-sent' | 'verifying' | 'pin' | 'station' | 'inventory' | 'notes' | 'success';

// ── Component ─────────────────────────────────────────────────────

export default function PublicSubmit() {
  const [step, setStep] = useState<Step>('email');
  const [token, setToken] = useState<string | null>(null);
  const [submitterEmail, setSubmitterEmail] = useState<string | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [submitterName, setSubmitterName] = useState('');
  const [items, setItems] = useState<InventoryTemplateItem[]>([]);
  const [counts, setCounts] = useState<Record<number, number | null>>({});
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [previewFiles, setPreviewFiles] = useState<{ file: File; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  // ── Magic Link: Email entry ───────────────────────────────────

  const [emailInput, setEmailInput] = useState('');
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'email' && emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, [step]);

  // ── On mount: check for ?token= in URL ───────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setStep('verifying');
      verifyMagicToken(urlToken);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyMagicToken = useCallback(async (tokenParam: string) => {
    try {
      const res = await fetch(`/api/public/magic-link/verify?token=${encodeURIComponent(tokenParam)}`);
      if (!res.ok) {
        setError('Verification failed. Please request a new sign-in link.');
        setStep('email');
        return;
      }
      const data = (await res.json()) as { success: boolean; email?: string; token?: string; error?: string };
      if (!data.success) {
        // MEDIUM-3: Never surface server error strings to users
        setError('This sign-in link is invalid or has expired. Please request a new one.');
        setStep('email');
        return;
      }
      setToken(data.token ?? tokenParam);
      setSubmitterEmail(data.email ?? null);
      // Remove token from URL without triggering a navigation
      window.history.replaceState({}, '', '/submit');
      setStep('station');
    } catch {
      setError('Verification failed. Please request a new sign-in link.');
      setStep('email');
    }
  }, []);

  const handleEmailSubmit = useCallback(async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/public/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        // MEDIUM-3: Never surface server error strings to users
        setError('Unable to send sign-in link. Please try again.');
        return;
      }
      setStep('email-sent');
    } catch {
      // MEDIUM-3: Never surface server error strings to users
      setError('Unable to send sign-in link. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [emailInput]);

  // ── PIN Step (legacy fallback) ─────────────────────────────────

  const [pin, setPin] = useState('');
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'pin' && pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, [step]);

  const handlePinSubmit = useCallback(async () => {
    if (!pin || pin.length < 4) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/public/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Invalid PIN');
      }
      const data = (await res.json()) as { success: boolean; token: string };
      setToken(data.token);
      setSubmitterEmail(null);
      setStep('station');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PIN verification failed');
    } finally {
      setLoading(false);
    }
  }, [pin]);

  // ── Station Step ──────────────────────────────────────────────

  const handleStationSelect = useCallback(
    async (s: Station) => {
      setStation(s);
      setError(null);
      setLoading(true);
      try {
        const res = await fetch(`/api/public/inventory/${s.id}`, {
          headers: token ? { 'X-Public-Token': token } : {},
        });
        if (!res.ok) throw new Error('Failed to load inventory items');
        const data = (await res.json()) as InventoryTemplateItem[];
        setItems(data);
        const initial: Record<number, number | null> = {};
        for (const item of data) {
          initial[item.item_id] = null;
        }
        setCounts(initial);
        setStep('inventory');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load items');
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  // ── Inventory Step ────────────────────────────────────────────

  const setCount = useCallback((itemId: number, value: number | null) => {
    setCounts((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const itemsByCategory = useMemo(() => {
    const grouped: Record<string, InventoryTemplateItem[]> = {};
    for (const cat of CATEGORIES) {
      const catItems = items.filter((i) => i.category === cat);
      if (catItems.length > 0) {
        grouped[cat] = catItems.sort((a, b) => a.sort_order - b.sort_order);
      }
    }
    return grouped;
  }, [items]);

  const progress = useMemo(() => {
    const total = items.length;
    const entered = Object.values(counts).filter((v) => v !== null && v !== undefined).length;
    return { total, entered };
  }, [items, counts]);

  const hasAnyCounts = progress.entered > 0;

  // ── File upload ───────────────────────────────────────────────

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0 || !token) return;

      setUploading(true);
      setError(null);

      const newPreviews: { file: File; url: string }[] = [];
      const newAttachments: UploadedAttachment[] = [];

      for (const file of Array.from(files)) {
        try {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/public/upload', {
            method: 'POST',
            headers: { 'X-Public-Token': token },
            body: formData,
          });

          if (!res.ok) {
            // MEDIUM-3: Never surface server error strings to users
            setError('Upload failed. Please try again.');
            continue;
          }

          const data = (await res.json()) as UploadedAttachment;
          newAttachments.push(data);
          newPreviews.push({ file, url: URL.createObjectURL(file) });
        } catch {
          // MEDIUM-3: Never surface server error strings to users
          setError('Upload failed. Please try again.');
        }
      }

      setAttachments((prev) => [...prev, ...newAttachments]);
      setPreviewFiles((prev) => [...prev, ...newPreviews]);
      setUploading(false);

      // Reset the file input so the same file can be re-selected
      e.target.value = '';
    },
    [token],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setPreviewFiles((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // ── Submit ────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!station || !token || !hasAnyCounts) return;
    setSubmitting(true);
    setError(null);

    try {
      const countEntries = Object.entries(counts)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([itemId, actualCount]) => ({
          item_id: Number(itemId),
          actual_count: actualCount!,
        }));

      const res = await fetch('/api/public/inventory/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Public-Token': token,
        },
        body: JSON.stringify({
          station_id: station.id,
          submitter_name: submitterName || undefined,
          counts: countEntries,
          notes: notes || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });

      if (!res.ok) {
        // MEDIUM-3: Never surface server error strings to users
        setError('Submission failed. Please try again.');
        return;
      }

      const data = (await res.json()) as SubmitResult;
      setSubmitResult(data);
      setStep('success');
    } catch {
      // MEDIUM-3: Never surface server error strings to users
      setError('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [station, token, hasAnyCounts, counts, submitterName, notes, attachments]);

  // ── Reset for "Submit Another" ────────────────────────────────

  const handleReset = useCallback(() => {
    setStep('station');
    setStation(null);
    setSubmitterName('');
    setItems([]);
    setCounts({});
    setNotes('');
    setAttachments([]);
    // Revoke all preview URLs
    for (const p of previewFiles) {
      URL.revokeObjectURL(p.url);
    }
    setPreviewFiles([]);
    setSubmitResult(null);
    setError(null);
  }, [previewFiles]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-surface text-white">
      {/* Header — always visible */}
      <div className="bg-surface/95 backdrop-blur-md border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <img src="/dcvfd-badge.svg" alt="DCVFD" className="h-8 w-auto" />
          <div>
            <h1 className="text-base font-bold leading-tight">EMS Inventory</h1>
            <p className="text-xs text-zinc-500">Public Submission Form</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* ── Step: Email Entry ──────────────────────────────── */}
        {step === 'email' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-sm glass rounded-2xl p-8 flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-dcvfd/30 flex items-center justify-center mb-5">
                <svg className="h-8 w-8 text-dcvfd-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-1">Sign In</h2>
              <p className="text-zinc-400 text-sm mb-6 text-center">
                Enter your email to receive a sign-in link
              </p>

              <input
                ref={emailInputRef}
                type="email"
                inputMode="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEmailSubmit(); }}
                placeholder="you@dcvfd.org"
                className="w-full bg-surface-overlay border-2 border-border-default rounded-xl py-3 px-4 text-white outline-none focus:border-dcvfd-accent focus:ring-1 focus:ring-dcvfd-accent/30 transition-all placeholder:text-zinc-600 mb-4"
                aria-label="Email address"
                autoComplete="email"
              />

              {error && (
                <div className="w-full rounded-xl bg-red-950/50 border border-red-900/50 px-4 py-2.5 text-sm text-red-300 mb-4">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleEmailSubmit}
                disabled={!emailInput.trim() || loading}
                className="w-full rounded-xl bg-dcvfd py-3.5 font-semibold text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light active:bg-dcvfd-dark active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none min-h-[48px] transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </span>
                ) : (
                  'Send me a sign-in link'
                )}
              </button>

              {/* Divider */}
              <div className="w-full flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border-subtle" />
                <span className="text-xs text-zinc-600">or</span>
                <div className="flex-1 h-px bg-border-subtle" />
              </div>

              <button
                type="button"
                onClick={() => { setError(null); setStep('pin'); }}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Use station PIN instead
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Email Sent Confirmation ─────────────────── */}
        {step === 'email-sent' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-sm glass rounded-2xl p-8 flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-dcvfd-accent/20 flex items-center justify-center mb-5">
                <svg className="h-8 w-8 text-dcvfd-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-1">Check your email</h2>
              <p className="text-zinc-400 text-sm text-center mb-2">
                We sent a sign-in link to
              </p>
              <p className="font-medium text-white text-sm mb-5 break-all text-center">
                {emailInput}
              </p>
              <p className="text-zinc-500 text-xs text-center mb-6">
                The link expires in 30 minutes. Click it to access the inventory form.
              </p>
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Use a different email
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Verifying token ──────────────────────────── */}
        {step === 'verifying' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="flex items-center gap-3 text-zinc-400">
              <div className="h-5 w-5 border-2 border-dcvfd-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Verifying sign-in link...</span>
            </div>
          </div>
        )}

        {/* ── Step: PIN (legacy fallback) ────────────────────── */}
        {step === 'pin' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-sm glass rounded-2xl p-8 flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-dcvfd/30 flex items-center justify-center mb-5">
                <svg className="h-8 w-8 text-dcvfd-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-1">Enter Station PIN</h2>
              <p className="text-zinc-400 text-sm mb-6 text-center">
                Enter the 4-digit PIN to access the inventory form
              </p>

              <input
                ref={pinInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePinSubmit(); }}
                placeholder="----"
                className="w-full text-center text-3xl font-mono tracking-[0.5em] bg-surface-overlay border-2 border-border-default rounded-xl py-4 px-6 text-white outline-none focus:border-dcvfd-accent focus:ring-1 focus:ring-dcvfd-accent/30 transition-all mb-4"
                aria-label="Station PIN"
              />

              {error && (
                <div className="w-full rounded-xl bg-red-950/50 border border-red-900/50 px-4 py-2.5 text-sm text-red-300 mb-4">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handlePinSubmit}
                disabled={pin.length < 4 || loading}
                className="w-full rounded-xl bg-dcvfd py-3.5 font-semibold text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light active:bg-dcvfd-dark active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none min-h-[48px] transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  'Continue'
                )}
              </button>

              {/* Back to email */}
              <button
                type="button"
                onClick={() => { setError(null); setStep('email'); }}
                className="mt-4 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Back to email sign-in
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Station Select ───────────────────────────── */}
        {step === 'station' && (
          <div className="flex flex-col items-center">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold mb-1">Select Your Station</h2>
              <p className="text-zinc-500 text-sm">Choose the station you are counting for</p>
              {submitterEmail && (
                <p className="text-xs text-dcvfd-accent mt-1">Signed in as {submitterEmail}</p>
              )}
            </div>

            <div className="w-full max-w-md grid grid-cols-2 gap-4 mb-8">
              {STATIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleStationSelect(s)}
                  disabled={loading}
                  className="group relative flex flex-col items-center justify-center rounded-2xl bg-surface-raised border border-border-subtle p-6 min-h-[120px] transition-all hover:border-dcvfd-accent/50 hover:bg-surface-overlay hover:shadow-lg hover:shadow-dcvfd/10 active:scale-[0.97] disabled:opacity-50"
                >
                  <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-zinc-700 group-hover:bg-dcvfd-accent transition-colors" />
                  <span className="text-3xl font-bold text-white group-hover:text-dcvfd-accent transition-colors">
                    {s.id}
                  </span>
                  <span className="text-sm text-zinc-400 mt-1 group-hover:text-zinc-300 transition-colors">
                    {STATION_NICKNAMES[s.id] ?? s.name}
                  </span>
                </button>
              ))}
            </div>

            {/* Submitter name — optional (skip if we have email from magic link) */}
            {!submitterEmail && (
              <div className="w-full max-w-md">
                <label htmlFor="submitter-name" className="block text-sm text-zinc-400 mb-1.5">
                  Who is submitting? (optional)
                </label>
                <input
                  id="submitter-name"
                  type="text"
                  value={submitterName}
                  onChange={(e) => setSubmitterName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-surface-overlay border-2 border-border-default rounded-xl py-3 px-4 text-white outline-none focus:border-dcvfd-accent focus:ring-1 focus:ring-dcvfd-accent/30 transition-all placeholder:text-zinc-600"
                />
              </div>
            )}

            {loading && (
              <div className="mt-8 flex items-center gap-2 text-zinc-400 text-sm">
                <div className="h-4 w-4 border-2 border-dcvfd-accent border-t-transparent rounded-full animate-spin" />
                Loading inventory items...
              </div>
            )}

            {error && (
              <div className="w-full max-w-md mt-4 rounded-xl bg-red-950/50 border border-red-900/50 px-4 py-2.5 text-sm text-red-300">
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── Step: Inventory Form ───────────────────────────── */}
        {step === 'inventory' && station && (
          <div className="pb-24">
            {/* Inventory header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-dcvfd-accent" />
                  <h2 className="text-lg font-bold">{station.name}</h2>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Fill in what you can -- all fields are optional
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-sm text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-surface-overlay transition-all"
              >
                Change
              </button>
            </div>

            {/* Progress indicator */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-zinc-400">
                  <span className="font-mono font-medium text-white">{progress.entered}</span>
                  <span className="text-zinc-600">/</span>
                  <span className="font-mono">{progress.total}</span>
                  <span className="ml-1.5">entered</span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    progress.entered === progress.total && progress.total > 0
                      ? 'bg-ems-green'
                      : 'bg-dcvfd-accent'
                  }`}
                  style={{
                    width: `${progress.total > 0 ? Math.round((progress.entered / progress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Category groups */}
            <div className="space-y-2">
              {Object.entries(itemsByCategory).map(([category, catItems]) => (
                <PublicCategoryGroup
                  key={category}
                  name={category}
                  items={catItems}
                  counts={counts}
                  onSetCount={setCount}
                />
              ))}
            </div>

            {/* Continue to notes button */}
            <div className="fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur-md border-t border-border-subtle px-4 py-3">
              <button
                type="button"
                onClick={() => setStep('notes')}
                disabled={!hasAnyCounts}
                className="w-full max-w-2xl mx-auto block rounded-xl bg-dcvfd py-3.5 font-semibold text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light active:bg-dcvfd-dark active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none min-h-[48px] transition-all"
              >
                {hasAnyCounts
                  ? `Continue with ${progress.entered} item${progress.entered !== 1 ? 's' : ''}`
                  : 'Enter at least one count'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Notes + Attachments + Submit ─────────────── */}
        {step === 'notes' && station && (
          <div className="pb-6">
            <div className="flex items-center gap-2 mb-6">
              <button
                type="button"
                onClick={() => setStep('inventory')}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-surface-overlay transition-all"
                aria-label="Back to inventory"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-lg font-bold">Notes and Attachments</h2>
            </div>

            {/* Summary card */}
            <div className="rounded-xl bg-surface-raised border border-border-subtle p-4 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Station</span>
                <span className="font-medium">{station.name}</span>
              </div>
              {submitterEmail && (
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-zinc-400">Signed in as</span>
                  <span className="font-medium text-dcvfd-accent truncate ml-2">{submitterEmail}</span>
                </div>
              )}
              {!submitterEmail && submitterName && (
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-zinc-400">Submitted by</span>
                  <span className="font-medium">{submitterName}</span>
                </div>
              )}
              <div className="flex justify-between text-sm mt-2">
                <span className="text-zinc-400">Items counted</span>
                <span className="font-mono font-medium">{progress.entered}</span>
              </div>
            </div>

            {/* Notes textarea */}
            <div className="mb-6">
              <label htmlFor="notes" className="block text-sm text-zinc-400 mb-1.5">
                Notes / Comments (optional)
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Any notes about this inventory check..."
                className="w-full bg-surface-overlay border-2 border-border-default rounded-xl py-3 px-4 text-white outline-none focus:border-dcvfd-accent focus:ring-1 focus:ring-dcvfd-accent/30 transition-all resize-y placeholder:text-zinc-600"
              />
            </div>

            {/* Image attachments */}
            <div className="mb-6">
              <label className="block text-sm text-zinc-400 mb-1.5">
                Photo Attachments (optional)
              </label>

              {/* Thumbnails of uploaded files */}
              {previewFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {previewFiles.map((pf, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-border-subtle">
                      <img
                        src={pf.url}
                        alt={pf.file.name}
                        className="w-full h-24 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Remove ${pf.file.name}`}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5">
                        <p className="text-[10px] text-zinc-300 truncate">{pf.file.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <label
                className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 px-4 text-sm transition-all cursor-pointer ${
                  uploading
                    ? 'border-zinc-700 text-zinc-500'
                    : 'border-border-default text-zinc-400 hover:border-dcvfd-accent hover:text-dcvfd-accent'
                }`}
              >
                {uploading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-dcvfd-accent border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Add Photos
                  </>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-red-950/50 border border-red-900/50 px-4 py-2.5 text-sm text-red-300 mb-4">
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !hasAnyCounts}
              className="w-full rounded-xl bg-dcvfd py-3.5 font-semibold text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light active:bg-dcvfd-dark active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none min-h-[48px] transition-all"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </span>
              ) : (
                'Submit Inventory'
              )}
            </button>
          </div>
        )}

        {/* ── Step: Success ──────────────────────────────────── */}
        {step === 'success' && submitResult && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="glass rounded-2xl p-8 w-full max-w-sm flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-dcvfd-accent/20 flex items-center justify-center mb-5">
                <svg className="h-8 w-8 text-dcvfd-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-1">Inventory Submitted</h2>
              <p className="text-zinc-400 text-sm mb-6">{station?.name}</p>

              {submitterEmail && (
                <p className="text-xs text-zinc-500 mb-4 text-center">
                  A confirmation has been sent to {submitterEmail}
                </p>
              )}

              <div className="w-full space-y-2 text-sm">
                <div className="flex justify-between rounded-lg bg-surface-overlay px-4 py-2.5">
                  <span className="text-zinc-400">Items submitted</span>
                  <span className="font-mono font-medium">{submitResult.items_submitted}</span>
                </div>
                <div className="flex justify-between rounded-lg bg-surface-overlay px-4 py-2.5">
                  <span className="text-zinc-400">Items short</span>
                  <span
                    className={`font-mono font-medium ${submitResult.items_short > 0 ? 'text-ems-red' : 'text-ems-green'}`}
                  >
                    {submitResult.items_short}
                  </span>
                </div>
                {submitResult.order_created && (
                  <div className="flex justify-between rounded-lg bg-surface-overlay px-4 py-2.5">
                    <span className="text-zinc-400">Resupply order</span>
                    <span className="font-medium text-ems-amber">Created</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="mt-6 w-full rounded-xl bg-dcvfd px-8 py-3.5 font-semibold text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light active:bg-dcvfd-dark active:scale-[0.98] min-h-[48px] transition-all"
              >
                Submit Another Inventory
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Category Group for public form ─────────────────────────────────

interface PublicCategoryGroupProps {
  name: string;
  items: InventoryTemplateItem[];
  counts: Record<number, number | null>;
  onSetCount: (itemId: number, value: number | null) => void;
}

function PublicCategoryGroup({ name, items, counts, onSetCount }: PublicCategoryGroupProps) {
  const [open, setOpen] = useState(true);
  const enteredCount = items.filter((i) => counts[i.item_id] !== null && counts[i.item_id] !== undefined).length;
  const allEntered = enteredCount === items.length;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="sticky top-0 z-10 flex w-full items-center justify-between bg-surface-raised px-4 py-2 text-left font-semibold text-white rounded-xl border border-border-subtle hover:border-zinc-600 transition-all"
      >
        <span className="flex items-center gap-2.5">
          <svg
            className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm">{name}</span>
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            allEntered
              ? 'bg-ems-green/15 text-ems-green border border-ems-green/20'
              : 'bg-zinc-800 text-zinc-400 border border-transparent'
          }`}
        >
          {enteredCount}/{items.length}
        </span>
      </button>
      {open && (
        <div className="mt-0.5 bg-surface-raised rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
          {items.map((item) => (
            <div key={item.item_id} className="flex items-center gap-3 px-4 py-1.5 min-h-[44px] hover:bg-surface-overlay/50 transition-colors">
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white truncate block">{item.name}</span>
                <span className="text-[10px] text-zinc-500">Target: {item.target_count}</span>
              </div>
              <NumericInput
                value={counts[item.item_id] ?? null}
                onChange={(v) => onSetCount(item.item_id, v)}
                target={item.target_count}
                aria-label={`Count for ${item.name}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
