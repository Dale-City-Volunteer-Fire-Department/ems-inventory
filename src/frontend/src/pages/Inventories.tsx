import { useState, useEffect, useCallback } from 'react';
import type { InventoryHistory } from '@shared/types';
import { useStations } from '../hooks/useStations';
import { apiFetch } from '../hooks/useApi';

interface InventorySession {
  id: number;
  station_id: number;
  station_name: string;
  submitted_by: string | null;
  submitted_at: string;
  item_count: number;
  items_short: number;
}

export default function Inventories() {
  const { stations } = useStations();
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [stationFilter, setStationFilter] = useState<number | null>(null);
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [sessionItems, setSessionItems] = useState<Record<number, InventoryHistory[]>>({});
  const [itemsLoading, setItemsLoading] = useState<number | null>(null);

  // Fetch sessions
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stationFilter) params.set('stationId', String(stationFilter));

    apiFetch<{ sessions: InventorySession[]; count: number }>(
      `/inventory/sessions${params.toString() ? `?${params}` : ''}`,
    )
      .then((data) => setSessions(data.sessions))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [stationFilter]);

  // Toggle session expansion and lazy-load items
  const toggleSession = useCallback(
    async (sessionId: number) => {
      if (expandedSession === sessionId) {
        setExpandedSession(null);
        return;
      }

      setExpandedSession(sessionId);

      if (!sessionItems[sessionId]) {
        setItemsLoading(sessionId);
        try {
          const data = await apiFetch<{ history: InventoryHistory[]; count: number }>(
            `/inventory/history?sessionId=${sessionId}`,
          );
          setSessionItems((prev) => ({ ...prev, [sessionId]: data.history }));
        } catch {
          setSessionItems((prev) => ({ ...prev, [sessionId]: [] }));
        } finally {
          setItemsLoading(null);
        }
      }
    },
    [expandedSession, sessionItems],
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'short':
        return 'bg-ems-red/15 text-ems-red border border-ems-red/20';
      case 'over':
        return 'bg-blue-500/15 text-blue-400 border border-blue-500/20';
      case 'good':
        return 'bg-ems-green/15 text-ems-green border border-ems-green/20';
      default:
        return 'bg-zinc-800 text-zinc-400 border border-zinc-700';
    }
  };

  return (
    <div className="min-h-dvh bg-surface text-white pb-20 md:pb-6">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border-subtle">
        <h1 className="text-xl font-bold">Inventory History</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Past completed inventory sessions</p>
      </div>

      {/* Station filter */}
      <div className="px-4 py-3 border-b border-border-subtle">
        <select
          value={stationFilter ?? ''}
          onChange={(e) => setStationFilter(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded-xl bg-surface-raised border border-border-subtle px-3 py-2.5 text-white text-sm focus:border-dcvfd-accent focus:outline-none transition-colors"
        >
          <option value="">All Stations</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="px-4 py-4 md:max-w-4xl md:mx-auto">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-dcvfd-accent border-t-transparent rounded-full" />
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-14 w-14 rounded-2xl bg-surface-raised border border-border-subtle flex items-center justify-center mb-4">
              <svg className="h-7 w-7 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <p className="text-zinc-400 font-medium">No inventories yet</p>
            <p className="text-zinc-600 text-sm mt-1">Completed inventory sessions will appear here</p>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="space-y-3">
            {sessions.map((session) => {
              const isExpanded = expandedSession === session.id;
              const items = sessionItems[session.id];
              const isLoadingItems = itemsLoading === session.id;

              return (
                <div
                  key={session.id}
                  className="rounded-2xl bg-surface-raised border border-border-subtle overflow-hidden"
                >
                  {/* Session row — clickable */}
                  <button
                    type="button"
                    onClick={() => toggleSession(session.id)}
                    className="w-full text-left px-4 py-3 hover:bg-surface-overlay transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">
                          {session.station_name}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {formatDate(session.submitted_at)} at {formatTime(session.submitted_at)}
                        </p>
                        {session.submitted_by && (
                          <p className="text-xs text-zinc-600 mt-0.5">by {session.submitted_by}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <div className="text-right">
                          <p className="text-xs text-zinc-500">
                            {session.item_count} item{session.item_count !== 1 ? 's' : ''}
                          </p>
                          {session.items_short > 0 ? (
                            <p className="text-xs font-medium text-ems-red mt-0.5">
                              {session.items_short} short
                            </p>
                          ) : (
                            <p className="text-xs font-medium text-ems-green mt-0.5">All good</p>
                          )}
                        </div>
                        <svg
                          className={`h-4 w-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-border-subtle px-4 py-3">
                      {isLoadingItems && (
                        <div className="flex justify-center py-4">
                          <div className="animate-spin h-5 w-5 border-2 border-dcvfd-accent border-t-transparent rounded-full" />
                        </div>
                      )}

                      {!isLoadingItems && items && items.length === 0 && (
                        <p className="text-sm text-zinc-500 text-center py-3">No item records found</p>
                      )}

                      {!isLoadingItems && items && items.length > 0 && (
                        <div className="space-y-1">
                          {/* Group items by category */}
                          {(() => {
                            const byCategory = new Map<string, InventoryHistory[]>();
                            for (const item of items) {
                              const group = byCategory.get(item.category) ?? [];
                              group.push(item);
                              byCategory.set(item.category, group);
                            }

                            return Array.from(byCategory.entries()).map(([category, catItems]) => (
                              <div key={category} className="mb-3">
                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                                  {category}
                                </p>
                                <div className="space-y-1">
                                  {catItems.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between rounded-lg bg-surface px-3 py-2"
                                    >
                                      <span className="text-sm text-zinc-300 truncate mr-2">{item.item_name}</span>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs text-zinc-500 font-mono">
                                          {item.actual_count}/{item.target_count}
                                        </span>
                                        <span
                                          className={`rounded-md px-2 py-0.5 text-xs font-mono font-bold ${statusColor(item.status)}`}
                                        >
                                          {item.delta > 0 ? `+${item.delta}` : item.delta}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
