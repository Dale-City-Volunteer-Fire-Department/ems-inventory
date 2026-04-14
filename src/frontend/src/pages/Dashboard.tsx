import { useState, useEffect } from 'react';
import { apiFetch } from '../hooks/useApi';
import { STATION_NICKNAMES } from '../hooks/useStations';
import type { DashboardStatsResponse } from '@shared/api-responses';

// ── Helpers ────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString();
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

type Freshness = 'green' | 'amber' | 'red' | 'gray';

function freshness(lastSubmission: string | null): Freshness {
  if (!lastSubmission) return 'gray';
  const days = daysSince(lastSubmission);
  if (days <= 7) return 'green';
  if (days <= 14) return 'amber';
  return 'red';
}

const FRESHNESS_STYLES: Record<Freshness, { dot: string; label: string; bg: string }> = {
  green: {
    dot: 'bg-ems-green',
    label: 'text-ems-green',
    bg: 'bg-ems-green/10 border-ems-green/20',
  },
  amber: {
    dot: 'bg-ems-amber',
    label: 'text-ems-amber',
    bg: 'bg-ems-amber/10 border-ems-amber/20',
  },
  red: {
    dot: 'bg-ems-red',
    label: 'text-ems-red',
    bg: 'bg-ems-red/10 border-ems-red/20',
  },
  gray: {
    dot: 'bg-zinc-600',
    label: 'text-zinc-500',
    bg: 'bg-zinc-800/50 border-zinc-700/50',
  },
};

// ── Component ──────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<DashboardStatsResponse>('/dashboard/stats')
      .then((stats) => {
        if (!cancelled) setData(stats);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-dvh bg-surface text-white">
        <div className="px-4 py-4 border-b border-border-subtle">
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Loading analytics...</p>
        </div>
        <div className="px-4 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-36 rounded-2xl" />
            ))}
          </div>
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="skeleton h-48 rounded-2xl" />
            <div className="skeleton h-48 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-surface text-white">
        <div className="px-4 py-4 border-b border-border-subtle">
          <h1 className="text-xl font-bold">Dashboard</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="h-14 w-14 rounded-2xl bg-ems-red/10 border border-ems-red/20 flex items-center justify-center mb-4">
            <svg className="h-7 w-7 text-ems-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-zinc-400 font-medium">Failed to load dashboard</p>
          <p className="text-zinc-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const totalShortages = data.stations.reduce((sum, s) => sum + s.itemsShort, 0);
  const maxCategoryCount = Math.max(...data.categoryShortages.map((c) => c.count), 1);

  // Find the most critical items across all stations
  const allShortItems = data.stations
    .flatMap((s) =>
      s.shortages.map((sh) => ({
        ...sh,
        stationName: s.stationName,
        stationId: s.stationId,
      })),
    )
    .sort((a, b) => a.delta - b.delta);

  const worstStations = [...data.stations].filter((s) => s.itemsShort > 0).sort((a, b) => b.itemsShort - a.itemsShort);

  const { pending, inProgress, filled } = data.orderPipeline;
  const totalOrders = pending + inProgress + filled;

  return (
    <div className="min-h-dvh bg-surface text-white pb-20 md:pb-6">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border-subtle">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Station health, shortages, and order pipeline</p>
      </div>

      <div className="px-4 py-4 md:max-w-7xl md:mx-auto space-y-6">
        {/* ── Station Health Cards ─────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Station Health</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.stations.map((station) => {
              const fresh = freshness(station.lastSubmission);
              const styles = FRESHNESS_STYLES[fresh];
              const nickname = STATION_NICKNAMES[station.stationId];

              return (
                <div
                  key={station.stationId}
                  className="rounded-2xl bg-surface-raised border border-border-subtle p-4 hover:border-zinc-600 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{station.stationName}</p>
                      {nickname && <p className="text-xs text-zinc-500 mt-0.5">{nickname}</p>}
                    </div>
                    <div
                      className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium border ${styles.bg}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${styles.dot} ${fresh !== 'gray' ? 'pulse-dot' : ''}`}
                      />
                      <span className={styles.label}>
                        {fresh === 'gray'
                          ? 'Never'
                          : station.lastSubmission
                            ? timeAgo(station.lastSubmission)
                            : 'Never'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold tabular-nums">
                        {station.itemsShort > 0 ? (
                          <span className="text-ems-red">{station.itemsShort}</span>
                        ) : (
                          <span className="text-ems-green">0</span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">items short</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-zinc-300 tabular-nums">{station.itemCount}</p>
                      <p className="text-xs text-zinc-500">total counted</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Middle row: Shortage Summary + Order Pipeline ──── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Shortage Summary */}
          <section className="lg:col-span-2 rounded-2xl bg-surface-raised border border-border-subtle p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Shortage Summary</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                  totalShortages > 0
                    ? 'bg-ems-red/15 text-ems-red border border-ems-red/20'
                    : 'bg-ems-green/15 text-ems-green border border-ems-green/20'
                }`}
              >
                {totalShortages} total
              </span>
            </div>

            {totalShortages === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <svg className="h-8 w-8 text-ems-green mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-zinc-400 text-sm">All stations fully stocked</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Most critical items */}
                <div>
                  <p className="text-xs text-zinc-500 mb-2 font-medium">Most Critical Items</p>
                  <div className="space-y-1">
                    {allShortItems.slice(0, 5).map((item, i) => (
                      <div
                        key={`${item.stationId}-${item.itemName}-${i}`}
                        className="flex items-center justify-between py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-white truncate">{item.itemName}</span>
                          <span className="shrink-0 text-xs text-zinc-600">{item.stationName}</span>
                        </div>
                        <span className="shrink-0 ml-2 rounded-md bg-ems-red/15 border border-ems-red/20 px-2 py-0.5 text-xs font-mono font-bold text-ems-red tabular-nums">
                          {item.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Worst-off stations */}
                {worstStations.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2 font-medium">Stations Needing Attention</p>
                    <div className="flex flex-wrap gap-2">
                      {worstStations.map((s) => (
                        <span
                          key={s.stationId}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-surface-overlay border border-border-subtle px-2.5 py-1 text-xs"
                        >
                          <span className="text-white font-medium">{s.stationName}</span>
                          <span className="text-ems-red font-bold tabular-nums">{s.itemsShort}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Order Pipeline */}
          <section className="rounded-2xl bg-surface-raised border border-border-subtle p-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Order Pipeline</h2>

            {totalOrders === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <svg className="h-8 w-8 text-zinc-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                <p className="text-zinc-500 text-sm">No orders</p>
              </div>
            ) : (
              <div className="space-y-3">
                <PipelineRow label="Pending" count={pending} dotClass="bg-ems-amber" />
                <PipelineRow label="In Progress" count={inProgress} dotClass="bg-blue-400" />
                <PipelineRow label="Filled" count={filled} dotClass="bg-ems-green" />
                <div className="pt-2 border-t border-border-subtle">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Total orders</span>
                    <span className="text-white font-bold tabular-nums">{totalOrders}</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Bottom row: Category Trends + Recent Activity ──── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Category Trends */}
          <section className="rounded-2xl bg-surface-raised border border-border-subtle p-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Shortages by Category</h2>

            {data.categoryShortages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <svg className="h-8 w-8 text-ems-green mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-zinc-400 text-sm">No shortages to display</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.categoryShortages
                  .sort((a, b) => b.count - a.count)
                  .map((cat) => {
                    const pct = Math.round((cat.count / maxCategoryCount) * 100);
                    return (
                      <div key={cat.category}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-zinc-300">{cat.category}</span>
                          <span className="text-xs font-mono font-bold text-ems-red tabular-nums">{cat.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-overlay overflow-hidden">
                          <div
                            className="h-full rounded-full bg-ems-red/70 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>

          {/* Recent Activity */}
          <section className="rounded-2xl bg-surface-raised border border-border-subtle p-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Recent Activity</h2>

            {data.recentSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <svg className="h-8 w-8 text-zinc-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-zinc-500 text-sm">No submissions yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {data.recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{session.stationName}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {session.submittedBy ? `${session.submittedBy} — ` : ''}
                        {timeAgo(session.submittedAt)}
                      </p>
                    </div>
                    <div className="shrink-0 ml-3 text-right">
                      {session.itemsShort > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-ems-red/15 border border-ems-red/20 px-2 py-0.5 text-xs font-mono font-bold text-ems-red tabular-nums">
                          {session.itemsShort} short
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-ems-green/15 border border-ems-green/20 px-2 py-0.5 text-xs font-medium text-ems-green">
                          All good
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function PipelineRow({ label, count, dotClass }: { label: string; count: number; dotClass: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
        <span className="text-sm text-zinc-300">{label}</span>
      </div>
      <span className="text-lg font-bold text-white tabular-nums">{count}</span>
    </div>
  );
}
