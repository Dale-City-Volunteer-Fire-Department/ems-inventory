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
      <div className="min-h-dvh flex flex-col items-center justify-center bg-neutral-900 text-white p-6">
        <div className="text-5xl mb-4">&#10003;</div>
        <h1 className="text-2xl font-bold mb-2">Inventory Submitted</h1>
        <p className="text-neutral-400 mb-6">{station.name}</p>
        <div className="bg-neutral-800 rounded-xl p-4 w-full max-w-sm space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-400">Total items</span>
            <span className="font-mono">{submitResult.totalItems}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Items short</span>
            <span className={`font-mono ${submitResult.shortItems > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {submitResult.shortItems}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Session</span>
            <span className="font-mono text-xs text-neutral-500">{submitResult.sessionId.slice(0, 8)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onChangeStation}
          className="mt-8 rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700 active:bg-blue-800 min-h-[48px]"
        >
          Done
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-neutral-900 text-white">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-neutral-400">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-neutral-900 text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-neutral-900/95 backdrop-blur-sm border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-bold">{station.name}</h1>
          </div>
          <button
            type="button"
            onClick={onChangeStation}
            className="text-sm text-neutral-400 hover:text-white px-2 py-1"
          >
            Change
          </button>
        </div>
        <ProgressBar entered={progress.entered} total={progress.total} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-900/50 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Category groups */}
      <div className="px-3 pt-3">
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
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-neutral-900/95 backdrop-blur-sm border-t border-neutral-800 px-4 py-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded-lg bg-blue-600 py-3.5 font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:bg-neutral-700 disabled:text-neutral-500 min-h-[48px]"
        >
          {submitting ? 'Submitting...' : canSubmit ? 'Submit Inventory' : `${progress.remaining} items remaining`}
        </button>
      </div>

      {/* Confirmation modal */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)}>
        <h2 className="text-lg font-bold text-white mb-2">Submit Inventory?</h2>
        <p className="text-sm text-neutral-300 mb-4">
          Submit inventory for {station.name}? {progress.total} items
          {shortages.length > 0 && <span className="text-red-400">, {shortages.length} items short</span>}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            className="flex-1 rounded-lg bg-neutral-700 py-2.5 font-medium text-white hover:bg-neutral-600 min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmSubmit}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 min-h-[44px]"
          >
            Confirm
          </button>
        </div>
      </Modal>
    </div>
  );
}
