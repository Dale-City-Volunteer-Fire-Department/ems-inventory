import { useState, useCallback, useMemo } from 'react';
import type { InventoryCount, Category } from '@shared/types';
import type { InventorySubmitResponse } from '@shared/api-responses';
import { CATEGORIES } from '@shared/categories';
import { apiFetch } from './useApi';

export interface InventoryItem extends InventoryCount {
  name: string;
  category: Category;
  sort_order: number;
}

interface SubmitPayload {
  stationId: number;
  counts: { itemId: number; actualCount: number }[];
  submittedBy?: string;
}

export function useInventory(stationId: number | null) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [counts, setCounts] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setInventorySubmitResponse] = useState<InventorySubmitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<InventoryItem[]>(`/inventory/current/${stationId}`);
      setItems(data);
      const initial: Record<number, number | null> = {};
      for (const item of data) {
        initial[item.item_id] = item.actual_count;
      }
      setCounts(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  const setCount = useCallback((itemId: number, value: number | null) => {
    setCounts((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const progress = useMemo(() => {
    const total = items.length;
    const entered = Object.values(counts).filter((v) => v !== null && v !== undefined).length;
    return { total, entered, remaining: total - entered };
  }, [items, counts]);

  const shortages = useMemo(() => {
    return items.filter((item) => {
      const count = counts[item.item_id];
      return count !== null && count !== undefined && count < item.target_count;
    });
  }, [items, counts]);

  const itemsByCategory = useMemo(() => {
    const grouped: Record<string, InventoryItem[]> = {};
    for (const cat of CATEGORIES) {
      const catItems = items.filter((i) => i.category === cat);
      if (catItems.length > 0) {
        grouped[cat] = catItems.sort((a, b) => a.sort_order - b.sort_order);
      }
    }
    return grouped;
  }, [items]);

  const canSubmit = progress.total > 0 && progress.remaining === 0;

  const submit = useCallback(async () => {
    if (!stationId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: SubmitPayload = {
        stationId,
        counts: Object.entries(counts)
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([itemId, actualCount]) => ({
            itemId: Number(itemId),
            actualCount: actualCount!,
          })),
      };
      const result = await apiFetch<InventorySubmitResponse>('/inventory/submit', {
        method: 'POST',
        body: payload,
      });
      setInventorySubmitResponse(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit inventory');
    } finally {
      setSubmitting(false);
    }
  }, [stationId, canSubmit, counts]);

  return {
    items,
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
  };
}
