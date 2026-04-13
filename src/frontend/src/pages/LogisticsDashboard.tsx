import { useState, useEffect, useCallback } from 'react';
import type { Order, OrderStatus, Category } from '@shared/types';
import type { OrdersResponse } from '@shared/api-responses';
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
      const filledBy = action === 'fill' ? (user?.name ?? 'Unknown') : undefined;

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
        try {
          const data = await apiFetch<OrdersResponse>('/orders');
          setOrders(data.orders);
        } catch {
          // leave optimistic state
        }
      } finally {
        setActionLoading(null);
      }
    },
    [user],
  );

  useEffect(() => {
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
    apiFetch<OrdersResponse>('/orders')
      .then((data) => setOrders(data.orders))
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
    .sort((a, b) => a.delta - b.delta);

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

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'shortages', label: 'Shortages', count: allShortages.length },
    { id: 'picklist', label: 'Pick List' },
    { id: 'orders', label: 'Orders', count: orders.filter((o) => o.status !== 'filled').length },
  ];

  return (
    <div className="min-h-dvh bg-surface text-white pb-20 md:pb-6">
      <div className="px-4 py-4 border-b border-border-subtle">
        <h1 className="text-xl font-bold">Logistics Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Station inventory overview and resupply orders</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-subtle overflow-x-auto no-print">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              tab === t.id
                ? 'border-dcvfd-accent text-dcvfd-accent'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                  tab === t.id ? 'bg-dcvfd-accent/20 text-dcvfd-accent' : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {t.count}
              </span>
            )}
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
            <div className="mb-4">
              <select
                value={selectedStationId ?? ''}
                onChange={(e) => setSelectedStationId(e.target.value ? Number(e.target.value) : null)}
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

            {allShortages.length === 0 ? (
              <EmptyState icon="check" message="No shortages found" subtitle="All stations are fully stocked" />
            ) : (
              <div className="space-y-1.5">
                {(selectedStationId ? allShortages.filter((s) => s.stationId === selectedStationId) : allShortages).map(
                  (item, i) => (
                    <div
                      key={`${item.stationId}-${item.itemName}-${i}`}
                      className="flex items-center justify-between rounded-xl bg-surface-raised border border-border-subtle px-4 py-3 hover:border-zinc-600 transition-colors"
                    >
                      <div>
                        <span className="text-sm text-white">{item.itemName}</span>
                        <span className="ml-2 text-xs text-zinc-500">{item.stationName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-500 font-mono">
                          {item.actual}/{item.target}
                        </span>
                        <span className="rounded-md bg-ems-red/15 border border-ems-red/20 px-2 py-0.5 text-xs font-mono font-bold text-ems-red">
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
                className="w-full rounded-xl bg-surface-raised border border-border-subtle px-3 py-2.5 text-white text-sm focus:border-dcvfd-accent focus:outline-none transition-colors"
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
                    className="rounded-xl bg-surface-raised border border-border-subtle px-4 py-2 text-sm text-white hover:bg-surface-overlay transition-colors"
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
              <EmptyState icon="check" message="No shortages" subtitle="This station is fully stocked" />
            ) : (
              <EmptyState icon="list" message="Select a station" subtitle="Generate a pick list for resupply" />
            )}
          </div>
        )}

        {!loading && tab === 'orders' && (
          <div>
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'pending', label: 'Pending' },
                  { key: 'in_progress', label: 'In Progress' },
                  { key: 'filled', label: 'Filled' },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                    statusFilter === f.key
                      ? 'bg-dcvfd-accent text-white shadow-sm'
                      : 'bg-surface-raised text-zinc-400 hover:text-white border border-border-subtle'
                  }`}
                >
                  {f.label}
                  {f.key !== 'all' && (
                    <span className="ml-1.5 text-xs opacity-70">{orders.filter((o) => o.status === f.key).length}</span>
                  )}
                </button>
              ))}
            </div>

            {(() => {
              const filtered = statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter);

              if (filtered.length === 0) {
                return (
                  <EmptyState
                    icon="inbox"
                    message={statusFilter === 'all' ? 'No orders yet' : `No ${statusFilter.replace('_', ' ')} orders`}
                    subtitle="Orders are created automatically when shortages are detected"
                  />
                );
              }

              const statusColors: Record<string, string> = {
                pending: 'bg-ems-amber/15 text-ems-amber border border-ems-amber/20',
                in_progress: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
                filled: 'bg-ems-green/15 text-ems-green border border-ems-green/20',
              };

              return (
                <div className="space-y-3">
                  {filtered.map((order) => {
                    const isExpanded = expandedPickLists.has(order.id);
                    const isActionLoading = actionLoading === order.id;

                    return (
                      <div key={order.id} className="rounded-2xl bg-surface-raised p-4 border border-border-subtle">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {stationNameMap.get(order.station_id) ?? `Station ${order.station_id}`}
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {new Date(order.submitted_at).toLocaleDateString()}{' '}
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

                        <p className="text-sm text-zinc-400 mb-3">
                          {order.items_short} item{order.items_short !== 1 ? 's' : ''} short
                        </p>

                        {order.status === 'filled' && (order.filled_by || order.filled_at) && (
                          <div className="mb-3 rounded-xl bg-ems-green/5 border border-ems-green/15 px-3 py-2">
                            <p className="text-xs text-ems-green">
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

                        {order.pick_list && (
                          <div className="mb-3">
                            <button
                              type="button"
                              onClick={() => togglePickList(order.id)}
                              className="text-xs text-dcvfd-accent hover:text-dcvfd-accent/80 transition-colors font-medium"
                            >
                              {isExpanded ? 'Hide Pick List' : 'View Pick List'}
                            </button>
                            {isExpanded && (
                              <pre className="mt-2 rounded-xl bg-surface border border-border-subtle px-3 py-2 text-xs text-zinc-300 whitespace-pre-wrap font-mono overflow-x-auto max-h-64 overflow-y-auto">
                                {order.pick_list}
                              </pre>
                            )}
                          </div>
                        )}

                        {order.status === 'pending' && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => setConfirmModal({ orderId: order.id, action: 'start' })}
                            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-white transition-all active:scale-[0.98]"
                          >
                            {isActionLoading ? 'Updating...' : 'Start Fulfilling'}
                          </button>
                        )}
                        {order.status === 'in_progress' && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => setConfirmModal({ orderId: order.id, action: 'fill' })}
                            className="w-full rounded-xl bg-ems-green hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-white transition-all active:scale-[0.98]"
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

      <Modal open={confirmModal !== null} onClose={() => setConfirmModal(null)}>
        {confirmModal && (
          <div>
            <div className="text-center mb-4">
              <div
                className={`mx-auto h-12 w-12 rounded-full flex items-center justify-center mb-3 ${
                  confirmModal.action === 'start' ? 'bg-blue-500/20' : 'bg-ems-green/20'
                }`}
              >
                <svg
                  className={`h-6 w-6 ${confirmModal.action === 'start' ? 'text-blue-400' : 'text-ems-green'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={
                      confirmModal.action === 'start'
                        ? 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z'
                        : 'M5 13l4 4L19 7'
                    }
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">
                {confirmModal.action === 'start' ? 'Start Fulfilling?' : 'Mark as Filled?'}
              </h2>
            </div>
            <p className="text-sm text-zinc-400 text-center mb-5">
              {confirmModal.action === 'start'
                ? 'This will mark the order as in progress.'
                : `This will mark the order as filled by ${user?.name ?? 'you'}.`}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-1 rounded-xl bg-surface-overlay border border-border-subtle px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleStatusTransition(confirmModal.orderId, confirmModal.action)}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white active:scale-[0.98] transition-all ${
                  confirmModal.action === 'start' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-ems-green hover:bg-green-500'
                }`}
              >
                {confirmModal.action === 'start' ? 'Start' : 'Mark Filled'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function EmptyState({ icon, message, subtitle }: { icon: string; message: string; subtitle?: string }) {
  const iconPath =
    {
      check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      list: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
      inbox:
        'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
    }[icon] ?? '';

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-14 w-14 rounded-2xl bg-surface-raised border border-border-subtle flex items-center justify-center mb-4">
        <svg className="h-7 w-7 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
        </svg>
      </div>
      <p className="text-zinc-400 font-medium">{message}</p>
      {subtitle && <p className="text-zinc-600 text-sm mt-1">{subtitle}</p>}
    </div>
  );
}
