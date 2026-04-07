import { useState, useEffect, useCallback } from 'react';
import type { Order, OrderStatus, Category } from '@shared/types';
import { useStations, STATION_NICKNAMES } from '../hooks/useStations';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../hooks/useApi';
import Modal from '../components/Modal';
import StationCard from '../components/StationCard';
import PickList, { type PickListItem } from '../components/PickList';

interface StationSummary {
  stationId: number;
  stationName: string;
  lastSubmission: string | null;
  shortageCount: number;
  shortages: ShortageItem[];
}

interface ShortageItem {
  itemName: string;
  category: Category;
  target: number;
  actual: number;
  delta: number;
}

type Tab = 'overview' | 'shortages' | 'picklist' | 'orders';
type StatusFilter = 'all' | OrderStatus;

export default function LogisticsDashboard() {
  const { stations } = useStations();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [summaries, setSummaries] = useState<StationSummary[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedPickLists, setExpandedPickLists] = useState<Set<number>>(new Set());
  const [confirmModal, setConfirmModal] = useState<{
    orderId: number;
    action: 'start' | 'fill';
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const stationNameMap = new Map(stations.map((s) => [s.id, s.name]));

  const togglePickList = useCallback((orderId: number) => {
    setExpandedPickLists((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }, []);

  const handleStatusTransition = useCallback(
    async (orderId: number, action: 'start' | 'fill') => {
      const newStatus: OrderStatus = action === 'start' ? 'in_progress' : 'filled';
      const filledBy = action === 'fill' ? user?.name ?? 'Unknown' : undefined;

      // Optimistic update
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: newStatus,
                filled_by: filledBy ?? o.filled_by,
                filled_at: action === 'fill' ? new Date().toISOString() : o.filled_at,
              }
            : o,
        ),
      );
      setConfirmModal(null);
      setActionLoading(orderId);

      try {
        await apiFetch('/orders', {
          method: 'PUT',
          body: { orderId, status: newStatus, ...(filledBy ? { filledBy } : {}) },
        });
      } catch {
        // Revert on error -- re-fetch orders
        try {
          const refreshed = await apiFetch<Order[]>('/orders');
          setOrders(refreshed);
        } catch {
          // If refresh also fails, leave the optimistic state
        }
      } finally {
        setActionLoading(null);
      }
    },
    [user],
  );

  useEffect(() => {
    // Load station summaries from API
    setLoading(true);
    Promise.all(
      stations.map(async (s) => {
        try {
          const data = await apiFetch<StationSummary>(`/inventory/current/${s.id}/summary`);
          return data;
        } catch {
          return {
            stationId: s.id,
            stationName: s.name,
            lastSubmission: null,
            shortageCount: 0,
            shortages: [],
          };
        }
      }),
    )
      .then(setSummaries)
      .finally(() => setLoading(false));
  }, [stations]);

  useEffect(() => {
    apiFetch<Order[]>('/orders')
      .then(setOrders)
      .catch(() => setOrders([]));
  }, []);

  const allShortages = summaries
    .flatMap((s) =>
      s.shortages.map((sh) => ({
        ...sh,
        stationName: s.stationName,
        stationId: s.stationId,
      })),
    )
    .sort((a, b) => a.delta - b.delta); // Most severe first (most negative delta)

  const selectedSummary = selectedStationId ? summaries.find((s) => s.stationId === selectedStationId) : null;

  const pickListItems: PickListItem[] = selectedSummary
    ? selectedSummary.shortages.map((s) => ({
        name: s.itemName,
        category: s.category,
        target: s.target,
        actual: s.actual,
        needed: s.target - s.actual,
      }))
    : [];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'shortages', label: 'Shortages' },
    { id: 'picklist', label: 'Pick List' },
    { id: 'orders', label: 'Orders' },
  ];

  return (
    <div className="min-h-dvh bg-neutral-950 text-white pb-20 md:pb-6">
      <div className="px-4 py-4 border-b border-neutral-800">
        <h1 className="text-xl font-bold">Logistics Dashboard</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 overflow-x-auto no-print">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-dcvfd-accent text-dcvfd-accent' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 md:max-w-6xl md:mx-auto">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-dcvfd-accent border-t-transparent rounded-full" />
          </div>
        )}

        {!loading && tab === 'overview' && (
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            {summaries.map((s) => (
              <StationCard
                key={s.stationId}
                name={s.stationName}
                nickname={STATION_NICKNAMES[s.stationId]}
                lastSubmission={s.lastSubmission ?? undefined}
                shortageCount={s.shortageCount}
                onClick={() => {
                  setSelectedStationId(s.stationId);
                  setTab('shortages');
                }}
              />
            ))}
          </div>
        )}

        {!loading && tab === 'shortages' && (
          <div>
            {/* Station filter */}
            <div className="mb-4">
              <select
                value={selectedStationId ?? ''}
                onChange={(e) => setSelectedStationId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-white text-sm"
              >
                <option value="">All Stations</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {allShortages.length === 0 ? (
              <p className="text-center text-neutral-500 py-8">No shortages found</p>
            ) : (
              <div className="space-y-1">
                {(selectedStationId ? allShortages.filter((s) => s.stationId === selectedStationId) : allShortages).map(
                  (item, i) => (
                    <div
                      key={`${item.stationId}-${item.itemName}-${i}`}
                      className="flex items-center justify-between rounded-lg bg-neutral-800 px-4 py-3"
                    >
                      <div>
                        <span className="text-sm text-white">{item.itemName}</span>
                        <span className="ml-2 text-xs text-neutral-500">{item.stationName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-500">
                          {item.actual}/{item.target}
                        </span>
                        <span className="rounded bg-red-900/80 px-2 py-0.5 text-xs font-mono font-bold text-red-300">
                          {item.delta}
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'picklist' && (
          <div>
            <div className="mb-4 no-print">
              <select
                value={selectedStationId ?? ''}
                onChange={(e) => setSelectedStationId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-white text-sm"
              >
                <option value="">Select station...</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedSummary && pickListItems.length > 0 ? (
              <>
                <div className="no-print mb-3">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-2 text-sm text-white hover:bg-neutral-700"
                  >
                    Print Pick List
                  </button>
                </div>
                <PickList
                  stationName={selectedSummary.stationName}
                  items={pickListItems}
                  date={new Date().toLocaleDateString()}
                />
              </>
            ) : selectedStationId ? (
              <p className="text-center text-neutral-500 py-8">No shortages for this station</p>
            ) : (
              <p className="text-center text-neutral-500 py-8">Select a station to generate pick list</p>
            )}
          </div>
        )}

        {!loading && tab === 'orders' && (
          <div>
            {/* Status filter buttons */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {([
                { key: 'all', label: 'All' },
                { key: 'pending', label: 'Pending' },
                { key: 'in_progress', label: 'In Progress' },
                { key: 'filled', label: 'Filled' },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === f.key
                      ? 'bg-dcvfd-accent text-white'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700'
                  }`}
                >
                  {f.label}
                  {f.key !== 'all' && (
                    <span className="ml-1.5 text-xs opacity-70">
                      {orders.filter((o) => o.status === f.key).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {(() => {
              const filtered =
                statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter);

              if (filtered.length === 0) {
                return (
                  <p className="text-center text-neutral-500 py-8">
                    {statusFilter === 'all' ? 'No orders found' : `No ${statusFilter.replace('_', ' ')} orders`}
                  </p>
                );
              }

              const statusColors: Record<string, string> = {
                pending: 'bg-amber-900/80 text-amber-300',
                in_progress: 'bg-blue-900/80 text-blue-300',
                filled: 'bg-green-900/80 text-green-300',
              };

              return (
                <div className="space-y-3">
                  {filtered.map((order) => {
                    const isExpanded = expandedPickLists.has(order.id);
                    const isActionLoading = actionLoading === order.id;

                    return (
                      <div key={order.id} className="rounded-xl bg-neutral-800 p-4 border border-neutral-700">
                        {/* Header row: station name + status badge */}
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {stationNameMap.get(order.station_id) ?? `Station ${order.station_id}`}
                            </p>
                            <p className="text-xs text-neutral-500">
                              Submitted {new Date(order.submitted_at).toLocaleDateString()}{' '}
                              {new Date(order.submitted_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[order.status] ?? ''}`}
                          >
                            {order.status.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Items short count */}
                        <p className="text-sm text-neutral-400 mb-3">
                          {order.items_short} item{order.items_short !== 1 ? 's' : ''} short
                        </p>

                        {/* Filled info (when applicable) */}
                        {order.status === 'filled' && (order.filled_by || order.filled_at) && (
                          <div className="mb-3 rounded-lg bg-green-950/30 border border-green-900/40 px-3 py-2">
                            <p className="text-xs text-green-400">
                              {order.filled_by && <>Filled by {order.filled_by}</>}
                              {order.filled_by && order.filled_at && ' — '}
                              {order.filled_at && (
                                <>
                                  {new Date(order.filled_at).toLocaleDateString()}{' '}
                                  {new Date(order.filled_at).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </>
                              )}
                            </p>
                          </div>
                        )}

                        {/* Pick list toggle */}
                        {order.pick_list && (
                          <div className="mb-3">
                            <button
                              type="button"
                              onClick={() => togglePickList(order.id)}
                              className="text-xs text-dcvfd-accent hover:text-dcvfd-accent/80 transition-colors"
                            >
                              {isExpanded ? 'Hide Pick List' : 'View Pick List'}
                            </button>
                            {isExpanded && (
                              <pre className="mt-2 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-xs text-neutral-300 whitespace-pre-wrap font-mono overflow-x-auto max-h-64 overflow-y-auto">
                                {order.pick_list}
                              </pre>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        {order.status === 'pending' && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => setConfirmModal({ orderId: order.id, action: 'start' })}
                            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
                          >
                            {isActionLoading ? 'Updating...' : 'Start Fulfilling'}
                          </button>
                        )}
                        {order.status === 'in_progress' && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => setConfirmModal({ orderId: order.id, action: 'fill' })}
                            className="w-full rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
                          >
                            {isActionLoading ? 'Updating...' : 'Mark Filled'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      <Modal open={confirmModal !== null} onClose={() => setConfirmModal(null)}>
        {confirmModal && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">
              {confirmModal.action === 'start' ? 'Start Fulfilling Order?' : 'Mark Order as Filled?'}
            </h2>
            <p className="text-sm text-neutral-400 mb-6">
              {confirmModal.action === 'start'
                ? 'This will mark the order as in progress. Other team members will see that someone is working on it.'
                : `This will mark the order as filled by ${user?.name ?? 'you'}.`}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-1 rounded-lg bg-neutral-700 hover:bg-neutral-600 px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleStatusTransition(confirmModal.orderId, confirmModal.action)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                  confirmModal.action === 'start'
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-green-600 hover:bg-green-500'
                }`}
              >
                {confirmModal.action === 'start' ? 'Start Fulfilling' : 'Mark Filled'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
