import { useState, useEffect } from 'react';
import type { Order, Category } from '@shared/types';
import { useStations, STATION_NICKNAMES } from '../hooks/useStations';
import { apiFetch } from '../hooks/useApi';
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

export default function LogisticsDashboard() {
  const { stations } = useStations();
  const [tab, setTab] = useState<Tab>('overview');
  const [summaries, setSummaries] = useState<StationSummary[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

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
    apiFetch<Order[]>('/orders?status=pending')
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
    <div className="min-h-dvh bg-neutral-900 text-white pb-20">
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
              tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}

        {!loading && tab === 'overview' && (
          <div className="space-y-3">
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
            {orders.length === 0 ? (
              <p className="text-center text-neutral-500 py-8">No pending orders</p>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => {
                  const statusColors: Record<string, string> = {
                    pending: 'bg-amber-900/80 text-amber-300',
                    in_progress: 'bg-blue-900/80 text-blue-300',
                    filled: 'bg-green-900/80 text-green-300',
                  };
                  return (
                    <div key={order.id} className="rounded-xl bg-neutral-800 p-4 border border-neutral-700">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-white">Station {order.station_id}</p>
                          <p className="text-xs text-neutral-500">
                            {new Date(order.submitted_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[order.status] ?? ''}`}
                        >
                          {order.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-400">{order.items_short} items short</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
