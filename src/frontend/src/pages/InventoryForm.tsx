import { useEffect, useState, useCallback } from 'react';
import type { Station } from '@shared/types';
import { useInventory } from '../hooks/useInventory';
import ProgressBar from '../components/ProgressBar';
import CategoryGroup from '../components/CategoryGroup';
import ItemRow from '../components/ItemRow';
import Modal from '../components/Modal';

interface InventoryFormProps {
  station: Station;
  onChangeStation: () => void;
}

export default function InventoryForm({ station, onChangeStation }: InventoryFormProps) {
  const {
    counts,
    loading,
    submitting,
    submitResult,
    error,
    progress,
    shortages,
    itemsByCategory,
    canSubmit,
    loadInventory,
    setCount,
    submit,
  } = useInventory(station.id);

  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleSubmit = useCallback(() => {
    setShowConfirm(true);
  }, []);

  const confirmSubmit = useCallback(async () => {
    setShowConfirm(false);
    await submit();
  }, [submit]);

  // Success screen
  if (submitResult) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-surface text-white p-6">
        <div className="glass rounded-2xl p-8 w-full max-w-sm flex flex-col items-center">
          <div className="h-16 w-16 rounded-full bg-dcvfd-accent/20 flex items-center justify-center mb-5">
            <svg className="h-8 w-8 text-dcvfd-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold mb-1">Inventory Submitted</h1>
          <p className="text-zinc-400 text-sm mb-6">{station.name}</p>

          <div className="w-full space-y-2 text-sm">
            <div className="flex justify-between rounded-lg bg-surface-overlay px-4 py-2.5">
              <span className="text-zinc-400">Total items</span>
              <span className="font-mono font-medium">{submitResult.itemCount}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-surface-overlay px-4 py-2.5">
              <span className="text-zinc-400">Items short</span>
              <span className={`font-mono font-medium ${submitResult.itemsShort > 0 ? 'text-ems-red' : 'text-ems-green'}`}>
                {submitResult.itemsShort}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onChangeStation}
            className="mt-6 w-full rounded-xl bg-dcvfd px-8 py-3.5 font-semibold text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light active:bg-dcvfd-dark active:scale-[0.98] min-h-[48px] transition-all"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface text-white">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-dcvfd-accent border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-zinc-500 text-sm">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface text-white pb-24 md:pb-6">
      {/* Header */}
      <div className="sticky top-0 md:top-0 z-20 bg-surface/95 backdrop-blur-md border-b border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-dcvfd-accent pulse-dot" />
            <h1 className="text-lg font-bold">{station.name}</h1>
          </div>
          <button
            type="button"
            onClick={onChangeStation}
            className="text-sm text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-surface-overlay transition-all"
          >
            Change
          </button>
        </div>
        <ProgressBar entered={progress.entered} total={progress.total} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 rounded-xl bg-red-950/50 border border-red-900/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Category groups */}
      <div className="px-3 pt-2 md:max-w-4xl md:mx-auto md:grid md:grid-cols-2 md:gap-3">
        {Object.entries(itemsByCategory).map(([category, items]) => {
          const enteredCount = items.filter(
            (i) => counts[i.item_id] !== null && counts[i.item_id] !== undefined,
          ).length;
          return (
            <CategoryGroup key={category} name={category} itemCount={items.length} enteredCount={enteredCount}>
              {items.map((item) => (
                <ItemRow
                  key={item.item_id}
                  name={item.name}
                  targetCount={item.target_count}
                  value={counts[item.item_id] ?? null}
                  onChange={(v) => setCount(item.item_id, v)}
                />
              ))}
            </CategoryGroup>
          );
        })}
      </div>

      {/* Fixed bottom submit bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 z-30 bg-surface/95 backdrop-blur-md border-t border-border-subtle px-4 py-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full md:max-w-md md:mx-auto md:block rounded-xl bg-dcvfd py-3.5 font-semibold text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light active:bg-dcvfd-dark active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none min-h-[48px] transition-all"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Submitting...
            </span>
          ) : canSubmit ? (
            'Submit Inventory'
          ) : (
            `${progress.remaining} items remaining`
          )}
        </button>
      </div>

      {/* Confirmation modal */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)}>
        <div className="text-center mb-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-dcvfd/20 flex items-center justify-center mb-3">
            <svg className="h-6 w-6 text-dcvfd-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">Submit Inventory?</h2>
        </div>
        <p className="text-sm text-zinc-300 text-center mb-5">
          {station.name} &mdash; {progress.total} items
          {shortages.length > 0 && <span className="text-ems-red"> ({shortages.length} short)</span>}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            className="flex-1 rounded-xl bg-surface-overlay border border-border-subtle py-2.5 font-medium text-white hover:bg-zinc-700 active:scale-[0.98] min-h-[44px] transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmSubmit}
            className="flex-1 rounded-xl bg-dcvfd py-2.5 font-medium text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light active:scale-[0.98] min-h-[44px] transition-all"
          >
            Confirm
          </button>
        </div>
      </Modal>
    </div>
  );
}
