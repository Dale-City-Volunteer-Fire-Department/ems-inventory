import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Item, StockTarget, Category } from '@shared/types';
import { CATEGORIES } from '@shared/categories';
import { apiFetch } from '../hooks/useApi';
import { STATION_NICKNAMES } from '../hooks/useStations';

const STATION_IDS = [10, 13, 18, 20] as const;

// Debounce helper
function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const debounced = useCallback(
    (...args: unknown[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay],
  ) as T;

  return debounced;
}

// Build a lookup key for targets
function targetKey(itemId: number, stationId: number): string {
  return `${itemId}-${stationId}`;
}

export default function ParManagement() {
  const [items, setItems] = useState<Item[]>([]);
  const [allTargets, setAllTargets] = useState<Map<string, StockTarget>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add item form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<Category>('Airway');
  const [addSaving, setAddSaving] = useState(false);

  // Inline rename
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ──────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Item[]; count: number }>('/items?active=false');
      setItems(data.items);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load items');
    }
  }, []);

  const loadAllTargets = useCallback(async () => {
    try {
      const results = await Promise.all(
        STATION_IDS.map((sid) =>
          apiFetch<{ stationId: number; targets: StockTarget[]; count: number }>(
            `/stock-targets?stationId=${sid}`,
          ),
        ),
      );
      const map = new Map<string, StockTarget>();
      for (const result of results) {
        for (const t of result.targets) {
          map.set(targetKey(t.item_id, t.station_id), t);
        }
      }
      setAllTargets(map);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load stock targets');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadItems(), loadAllTargets()]).finally(() => setLoading(false));
  }, [loadItems, loadAllTargets]);

  // ── Filtering & grouping ──────────────────────────────────────────

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
  }, [items, search]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, Item[]> = {};
    for (const cat of CATEGORIES) {
      const catItems = filteredItems.filter((i) => i.category === cat);
      if (catItems.length > 0) {
        groups[cat] = catItems.sort((a, b) => a.sort_order - b.sort_order);
      }
    }
    return groups;
  }, [filteredItems]);

  // ── Auto-save PAR count ───────────────────────────────────────────

  const saveTarget = useCallback(
    async (itemId: number, stationId: number, targetCount: number) => {
      const key = targetKey(itemId, stationId);
      setSavingCells((prev) => new Set(prev).add(key));
      try {
        await apiFetch<{ itemId: number; stationId: number; targetCount: number }>(
          '/stock-targets',
          { method: 'PUT', body: { itemId, stationId, targetCount } },
        );
        // Update local state
        setAllTargets((prev) => {
          const next = new Map(prev);
          const existing = next.get(key);
          if (existing) {
            next.set(key, { ...existing, target_count: targetCount });
          } else {
            // Create a placeholder entry
            next.set(key, {
              id: 0,
              item_id: itemId,
              station_id: stationId,
              target_count: targetCount,
              updated_at: new Date().toISOString(),
            });
          }
          return next;
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to save target');
      } finally {
        setSavingCells((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [],
  );

  const debouncedSave = useDebouncedCallback(
    (itemId: number, stationId: number, targetCount: number) => {
      saveTarget(itemId, stationId, targetCount);
    },
    600,
  );

  // ── Handlers ──────────────────────────────────────────────────────

  const handleParChange = (itemId: number, stationId: number, value: string) => {
    const num = value === '' ? 0 : parseInt(value, 10);
    if (isNaN(num) || num < 0) return;

    // Optimistic local update
    const key = targetKey(itemId, stationId);
    setAllTargets((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing) {
        next.set(key, { ...existing, target_count: num });
      } else {
        next.set(key, {
          id: 0,
          item_id: itemId,
          station_id: stationId,
          target_count: num,
          updated_at: new Date().toISOString(),
        });
      }
      return next;
    });

    debouncedSave(itemId, stationId, num);
  };

  const handleCheckboxToggle = async (itemId: number, stationId: number, currentCount: number) => {
    // If stocked (count > 0), set to 0. If not stocked, set to 1 as default.
    const newCount = currentCount > 0 ? 0 : 1;
    await saveTarget(itemId, stationId, newCount);
  };

  const handleToggleActive = async (item: Item) => {
    try {
      await apiFetch<{ item: Item }>(`/items/${item.id}`, {
        method: 'PUT',
        body: { is_active: !item.is_active },
      });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i)),
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update item');
    }
  };

  const handleAddItem = async () => {
    if (!newName.trim()) return;
    setAddSaving(true);
    try {
      const data = await apiFetch<{ item: Item }>('/items', {
        method: 'POST',
        body: { name: newName.trim(), category: newCategory },
      });
      setItems((prev) => [...prev, data.item]);
      setNewName('');
      setNewCategory('Airway');
      setShowAddForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setAddSaving(false);
    }
  };

  const handleRenameStart = (item: Item) => {
    setEditingItemId(item.id);
    setEditingName(item.name);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const handleRenameCommit = async () => {
    if (editingItemId === null || !editingName.trim()) {
      setEditingItemId(null);
      return;
    }
    const item = items.find((i) => i.id === editingItemId);
    if (!item || item.name === editingName.trim()) {
      setEditingItemId(null);
      return;
    }
    try {
      await apiFetch<{ item: Item }>(`/items/${editingItemId}`, {
        method: 'PUT',
        body: { name: editingName.trim() },
      });
      setItems((prev) =>
        prev.map((i) => (i.id === editingItemId ? { ...i, name: editingName.trim() } : i)),
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to rename item');
    } finally {
      setEditingItemId(null);
    }
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-zinc-400 text-sm">Loading PAR data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">PAR Management</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Set target stock levels per item per station
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-dcvfd-accent text-white hover:bg-dcvfd-light transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Item
        </button>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-red-900/30 border border-red-800/50 text-red-300 text-sm">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Add item form */}
      {showAddForm && (
        <div className="p-4 rounded-lg bg-surface-raised border border-border-subtle space-y-3">
          <h3 className="text-sm font-medium text-zinc-200">New Item</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 mb-1">Item Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. NPA 28Fr"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-zinc-100 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-dcvfd-accent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddItem();
                }}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as Category)}
                className="px-3 py-2 rounded-lg bg-surface border border-border-subtle text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-dcvfd-accent"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddItem}
                disabled={addSaving || !newName.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-dcvfd-accent text-white hover:bg-dcvfd-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {addSaving ? 'Saving...' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewName('');
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-surface border border-border-subtle text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full pl-10 pr-3 py-2 rounded-lg bg-surface-raised border border-border-subtle text-zinc-100 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-dcvfd-accent"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[700px]">
          {/* Sticky header */}
          <div className="grid grid-cols-[1fr_auto] gap-0 items-center sticky top-0 z-10 bg-surface rounded-t-lg border border-border-subtle">
            <div className="px-3 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Item
            </div>
            <div className="grid grid-cols-4 gap-0">
              {STATION_IDS.map((sid) => (
                <div
                  key={sid}
                  className="w-[110px] px-2 py-2.5 text-center text-xs font-medium text-zinc-400 uppercase tracking-wider border-l border-border-subtle"
                >
                  <div>Stn {sid}</div>
                  <div className="text-[10px] text-zinc-500 normal-case tracking-normal">
                    {STATION_NICKNAMES[sid]}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category groups */}
          {Object.entries(groupedByCategory).map(([cat, catItems]) => {
            const isCollapsed = collapsedCategories.has(cat);
            return (
              <div key={cat} className="border-x border-border-subtle">
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-surface-overlay border-y border-border-subtle text-left hover:bg-zinc-800/50 transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-sm font-medium text-zinc-200">{cat}</span>
                  <span className="text-xs text-zinc-500">({catItems.length})</span>
                </button>

                {/* Item rows */}
                {!isCollapsed &&
                  catItems.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      allTargets={allTargets}
                      savingCells={savingCells}
                      editingItemId={editingItemId}
                      editingName={editingName}
                      renameInputRef={renameInputRef}
                      onParChange={handleParChange}
                      onCheckboxToggle={handleCheckboxToggle}
                      onToggleActive={handleToggleActive}
                      onRenameStart={handleRenameStart}
                      onRenameChange={setEditingName}
                      onRenameCommit={handleRenameCommit}
                    />
                  ))}
              </div>
            );
          })}

          {/* Bottom border */}
          <div className="border-b border-x border-border-subtle rounded-b-lg h-1" />
        </div>
      </div>

      {/* Empty state */}
      {Object.keys(groupedByCategory).length === 0 && !loading && (
        <div className="text-center py-12 text-zinc-500 text-sm">
          {search ? 'No items match your search.' : 'No items found. Add one to get started.'}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-zinc-500 pt-2">
        <div className="flex items-center gap-1.5">
          <input type="checkbox" checked readOnly className="w-3 h-3 accent-dcvfd-accent" />
          <span>Item stocked at station</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/40" />
          <span>Saving...</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-600 line-through">Item Name</span>
          <span>= Inactive (soft-deleted)</span>
        </div>
      </div>
    </div>
  );
}

// ── Item Row Component ────────────────────────────────────────────────

interface ItemRowProps {
  item: Item;
  allTargets: Map<string, StockTarget>;
  savingCells: Set<string>;
  editingItemId: number | null;
  editingName: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onParChange: (itemId: number, stationId: number, value: string) => void;
  onCheckboxToggle: (itemId: number, stationId: number, currentCount: number) => void;
  onToggleActive: (item: Item) => void;
  onRenameStart: (item: Item) => void;
  onRenameChange: (name: string) => void;
  onRenameCommit: () => void;
}

function ItemRow({
  item,
  allTargets,
  savingCells,
  editingItemId,
  editingName,
  renameInputRef,
  onParChange,
  onCheckboxToggle,
  onToggleActive,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
}: ItemRowProps) {
  const isEditing = editingItemId === item.id;

  return (
    <div
      className={`grid grid-cols-[1fr_auto] gap-0 items-center border-b border-border-subtle last:border-b-0 ${
        !item.is_active ? 'opacity-50' : ''
      } hover:bg-surface-overlay/50 transition-colors`}
    >
      {/* Item name cell */}
      <div className="flex items-center gap-2 px-3 py-1.5 min-w-0">
        {isEditing ? (
          <input
            ref={renameInputRef}
            type="text"
            value={editingName}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit();
              if (e.key === 'Escape') onRenameCommit();
            }}
            className="flex-1 min-w-0 px-2 py-0.5 rounded bg-surface border border-dcvfd-accent text-sm text-zinc-100 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => onRenameStart(item)}
            className={`flex-1 min-w-0 text-left text-sm truncate ${
              item.is_active
                ? 'text-zinc-200 hover:text-dcvfd-accent'
                : 'text-zinc-500 line-through'
            } transition-colors`}
            title="Click to rename"
          >
            {item.name}
          </button>
        )}

        {/* Active toggle */}
        <button
          onClick={() => onToggleActive(item)}
          className={`shrink-0 p-1 rounded transition-colors ${
            item.is_active
              ? 'text-zinc-500 hover:text-red-400'
              : 'text-emerald-600 hover:text-emerald-400'
          }`}
          title={item.is_active ? 'Deactivate item' : 'Reactivate item'}
        >
          {item.is_active ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </button>
      </div>

      {/* Station cells */}
      <div className="grid grid-cols-4 gap-0">
        {STATION_IDS.map((sid) => {
          const key = targetKey(item.id, sid);
          const target = allTargets.get(key);
          const count = target?.target_count ?? 0;
          const isSaving = savingCells.has(key);
          const isStocked = count > 0;

          return (
            <div
              key={sid}
              className={`w-[110px] flex items-center justify-center gap-1.5 px-2 py-1.5 border-l border-border-subtle ${
                isSaving ? 'bg-amber-500/5' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={isStocked}
                onChange={() => onCheckboxToggle(item.id, sid, count)}
                className="w-3.5 h-3.5 accent-dcvfd-accent shrink-0 cursor-pointer"
                title={isStocked ? 'Remove from station' : 'Add to station'}
              />
              <input
                type="text"
                inputMode="numeric"
                value={count === 0 && !isStocked ? '' : String(count)}
                onChange={(e) => onParChange(item.id, sid, e.target.value)}
                className={`w-12 px-1.5 py-0.5 rounded text-center text-sm font-mono bg-surface border text-zinc-100 focus:outline-none focus:ring-1 focus:ring-dcvfd-accent ${
                  isSaving ? 'border-amber-500/40' : 'border-border-subtle'
                }`}
                placeholder="0"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
