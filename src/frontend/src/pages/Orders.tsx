import { useState, useEffect, useCallback } from 'react';
import type { Order, OrderStatus } from '@shared/types';
import type { OrdersResponse } from '@shared/api-responses';
import { useStations } from '../hooks/useStations';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../hooks/useApi';
import Modal from '../components/Modal';

type StatusFilter = 'all' | OrderStatus;

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-ems-amber/15 text-ems-amber border border-ems-amber/20',
  in_progress: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  filled: 'bg-ems-green/15 text-ems-green border border-ems-green/20',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  filled: 'Filled',
};

export default function Orders() {
  const { stations } = useStations();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    orderId: number;
    action: 'start' | 'fill';
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const stationNameMap = new Map(stations.map((s) => [s.id, s.name]));

  // Fetch orders
  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<OrdersResponse>('/orders')
      .then((data) => setOrders(data.orders))
      .catch((err) => {
        setOrders([]);
        setError(err instanceof Error ? err.message : 'Failed to load orders');
      })
      .finally(() => setLoading(false));
  }, []);

  const togglePickList = useCallback(
    (orderId: number) => {
      setExpandedOrder(expandedOrder === orderId ? null : orderId);
    },
    [expandedOrder],
  );

  const handleStatusTransition = useCallback(
    async (orderId: number, action: 'start' | 'fill') => {
      const newStatus: OrderStatus = action === 'start' ? 'in_progress' : 'filled';
      const filledBy = action === 'fill' ? (user?.name ?? 'Unknown') : undefined;

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
        // Revert on failure — refetch
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

  const filtered = statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter);

  const filterButtons: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'filled', label: 'Filled' },
  ];

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-dvh bg-surface text-white pb-20 md:pb-6">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border-subtle">
        <h1 className="text-xl font-bold">Resupply Orders</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Pick lists and order fulfillment</p>
      </div>

      {/* Status filter tabs */}
      <div className="px-4 py-3 border-b border-border-subtle">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filterButtons.map((f) => (
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
      </div>

      {/* Content */}
      <div className="px-4 py-4 md:max-w-4xl md:mx-auto">
        {error && (
          <div className="mb-4 rounded-xl bg-red-950/50 border border-red-900/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-dcvfd-accent border-t-transparent rounded-full" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-14 w-14 rounded-2xl bg-surface-raised border border-border-subtle flex items-center justify-center mb-4">
              <svg className="h-7 w-7 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
            </div>
            <p className="text-zinc-400 font-medium">
              {statusFilter === 'all' ? 'No orders yet' : `No ${STATUS_LABELS[statusFilter]?.toLowerCase()} orders`}
            </p>
            <p className="text-zinc-600 text-sm mt-1">Orders are created automatically when shortages are detected</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((order) => {
              const isExpanded = expandedOrder === order.id;
              const isActionLoading = actionLoading === order.id;

              return (
                <div key={order.id} className="rounded-2xl bg-surface-raised p-4 border border-border-subtle">
                  {/* Order header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {stationNameMap.get(order.station_id) ?? `Station ${order.station_id}`}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {formatDate(order.submitted_at)} {formatTime(order.submitted_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? ''}`}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>

                  {/* Item count */}
                  <p className="text-sm text-zinc-400 mb-3">
                    {order.items_short} item{order.items_short !== 1 ? 's' : ''} short
                  </p>

                  {/* Filled info */}
                  {order.status === 'filled' && (order.filled_by || order.filled_at) && (
                    <div className="mb-3 rounded-xl bg-ems-green/5 border border-ems-green/15 px-3 py-2">
                      <p className="text-xs text-ems-green">
                        {order.filled_by && <>Filled by {order.filled_by}</>}
                        {order.filled_by && order.filled_at && ' \u2014 '}
                        {order.filled_at && (
                          <>
                            {formatDate(order.filled_at)} {formatTime(order.filled_at)}
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

                  {/* Action buttons */}
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
        )}
      </div>

      {/* Confirmation modal */}
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
