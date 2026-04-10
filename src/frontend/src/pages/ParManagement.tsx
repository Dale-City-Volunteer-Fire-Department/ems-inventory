import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Item, StockTarget, Category } from '@shared/types';
import type { ItemsResponse, StockTargetsResponse, ItemResponse, StockTargetUpdateResponse } from '@shared/api-responses';
import { CATEGORIES } from '@shared/categories';
import { apiFetch } from '../hooks/useApi';
import { STATION_NICKNAMES } from '../hooks/useStations';

const STATION_IDS = [10, 13, 18, 20] as const;

// Debounce helper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const debounced = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]) => {
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

  // Inline delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Category management
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameCategoryValue, setRenameCategoryValue] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const renameCategoryRef = useRef<HTMLInputElement>(null);

  // ── Data loading ──────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    try {
      const data = await apiFetch<ItemsResponse>('/items?active=false');
      setItems(data.items);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load items');
    }
  }, []);

  const loadAllTargets = useCallback(async () => {
    try {
      const results = await Promise.all(
        STATION_IDS.map((sid) =>
          apiFetch<StockTargetsResponse>(
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

  // Merged list of base + custom categories
  const allCategories = useMemo(() => {
    const base = CATEGORIES as readonly string[];
    const fromItems = new Set(items.map((i) => i.category));
    const merged = [...base];
    for (const cat of customCategories) {
      if (!merged.includes(cat)) merged.push(cat);
    }
    for (const cat of fromItems) {
      if (!merged.includes(cat)) merged.push(cat);
    }
    return merged;
  }, [items, customCategories]);

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
    for (const cat of allCategories) {
      const catItems = filteredItems.filter((i) => i.category === cat);
      if (catItems.length > 0) {
        groups[cat] = catItems.sort((a, b) => a.sort_order - b.sort_order);
      }
    }
    return groups;
  }, [filteredItems, allCategories]);

  // ── Auto-save PAR count ───────────────────────────────────────────

  const saveTarget = useCallback(
    async (itemId: number, stationId: number, targetCount: number) => {
      const key = targetKey(itemId, stationId);
      setSavingCells((prev) => new Set(prev).add(key));
      try {
        await apiFetch<StockTargetUpdateResponse>(
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

  const handleToggleActive = async (item: Item) => {
    try {
      await apiFetch<ItemResponse>(`/items/${item.id}`, {
        method: 'PUT',
        body: { is_active: !item.is_active },
      });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i)),
      );
      setConfirmDeleteId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update item');
    }
  };

  const handleCategoryChange = async (item: Item, newCat: Category) => {
    if (newCat === item.category) return;
    try {
      await apiFetch<ItemResponse>(`/items/${item.id}`, {
        method: 'PUT',
        body: { category: newCat },
      });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, category: newCat } : i)),
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to change category');
    }
  };

  const handleAddItem = async () => {
    if (!newName.trim()) return;
    setAddSaving(true);
    try {
      const data = await apiFetch<ItemResponse>('/items', {
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
      await apiFetch<ItemResponse>(`/items/${editingItemId}`, {
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

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name || allCategories.includes(name)) return;
    setCustomCategories((prev) => [...prev, name]);
    setNewCategoryName('');
  };

  const handleRenameCategoryStart = (cat: string) => {
    setRenamingCategory(cat);
    setRenameCategoryValue(cat);
    setTimeout(() => renameCategoryRef.current?.focus(), 0);
  };

  const handleRenameCategoryCommit = async () => {
    if (!renamingCategory || !renameCategoryValue.trim()) {
      setRenamingCategory(null);
      return;
    }
    const oldName = renamingCategory;
    const newName = renameCategoryValue.trim();
    if (oldName === newName) {
      setRenamingCategory(null);
      return;
    }
    setCategoryBusy(true);
    try {
      // Find all items in the old category and batch-update them
      const affected = items.filter((i) => i.category === oldName);
      await Promise.all(
        affected.map((item) =>
          apiFetch<ItemResponse>(`/items/${item.id}`, {
            method: 'PUT',
            body: { category: newName },
          }),
        ),
      );
      // Update local items state
      setItems((prev) =>
        prev.map((i) =>
          i.category === oldName ? { ...i, category: newName as Category } : i,
        ),
      );
      // Update custom categories list
      setCustomCategories((prev) =>
        prev.map((c) => (c === oldName ? newName : c)),
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to rename category');
    } finally {
      setCategoryBusy(false);
      setRenamingCategory(null);
    }
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
    <div className="px-4 py-4 space-y-3">
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
                {allCategories.map((cat) => (
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

      {/* Manage Categories toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowCategoryPanel(!showCategoryPanel)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border-subtle text-zinc-300 hover:text-zinc-100 hover:bg-surface-raised transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
          </svg>
          Manage Categories
          <svg
            className={`w-3 h-3 transition-transform ${showCategoryPanel ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Category management panel */}
      {showCategoryPanel && (
        <div className="p-4 rounded-lg bg-surface-raised border border-border-subtle space-y-3">
          <h3 className="text-sm font-medium text-zinc-200">Categories</h3>
          <p className="text-xs text-zinc-500">Click a category name to rename it. Renaming updates all items in that category.</p>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {allCategories.map((cat) => {
              const count = items.filter((i) => i.category === cat).length;
              const isRenaming = renamingCategory === cat;
              return (
                <div key={cat} className="flex items-center">
                  {isRenaming ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={renameCategoryRef}
                        type="text"
                        value={renameCategoryValue}
                        onChange={(e) => setRenameCategoryValue(e.target.value)}
                        onBlur={handleRenameCategoryCommit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameCategoryCommit();
                          if (e.key === 'Escape') setRenamingCategory(null);
                        }}
                        disabled={categoryBusy}
                        className="px-2 py-1 rounded-lg text-xs bg-surface border border-dcvfd-accent text-zinc-100 focus:outline-none w-28"
                      />
                      {categoryBusy && (
                        <span className="text-[10px] text-amber-400">Saving...</span>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRenameCategoryStart(cat)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-dcvfd/30 text-zinc-200 hover:bg-dcvfd/50 hover:text-white border border-dcvfd/40 transition-colors"
                      title="Click to rename"
                    >
                      {cat}
                      <span className="text-zinc-500">{count}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add new category */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
              className="flex-1 max-w-xs px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-zinc-100 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-dcvfd-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCategory();
              }}
            />
            <button
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim() || allCategories.includes(newCategoryName.trim())}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-dcvfd-accent text-white hover:bg-dcvfd-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          </div>
        </div>
      )}

      {/* Two-column category grid on desktop, single column on mobile */}
      <div className="md:grid md:grid-cols-2 md:gap-3 space-y-3 md:space-y-0">
        {Object.entries(groupedByCategory).map(([cat, catItems]) => {
          const isCollapsed = collapsedCategories.has(cat);
          return (
            <div
              key={cat}
              className="rounded-lg border border-border-subtle bg-surface overflow-hidden"
            >
              {/* Category header — always visible, spans full width */}
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-surface-raised text-left hover:bg-zinc-800/50 transition-colors"
              >
                <svg
                  className={`w-3 h-3 text-zinc-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-sm font-medium text-zinc-200">{cat}</span>
                <span className="text-xs text-zinc-500">
                  {catItems.length} item{catItems.length !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Station column headers + item rows — hidden when collapsed */}
              {!isCollapsed && (
                <div>
                  <div className="grid grid-cols-[1fr_repeat(4,56px)] items-center border-b border-border-subtle px-2 py-1">
                    <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider pl-1">
                      Item
                    </div>
                    {STATION_IDS.map((sid) => (
                      <div
                        key={sid}
                        className="text-center text-[10px] font-medium text-zinc-500 uppercase tracking-wider leading-tight"
                        title={STATION_NICKNAMES[sid]}
                      >
                        FS {sid}
                      </div>
                    ))}
                  </div>

                  {/* Item rows */}
                  {catItems.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      allTargets={allTargets}
                      savingCells={savingCells}
                      editingItemId={editingItemId}
                      editingName={editingName}
                      renameInputRef={renameInputRef}
                      confirmDeleteId={confirmDeleteId}
                      categoryList={allCategories}
                      onParChange={handleParChange}
                      onToggleActive={handleToggleActive}
                      onRenameStart={handleRenameStart}
                      onRenameChange={setEditingName}
                      onRenameCommit={handleRenameCommit}
                      onConfirmDelete={setConfirmDeleteId}
                      onCategoryChange={handleCategoryChange}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {Object.keys(groupedByCategory).length === 0 && !loading && (
        <div className="text-center py-12 text-zinc-500 text-sm">
          {search ? 'No items match your search.' : 'No items found. Add one to get started.'}
        </div>
      )}
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
  confirmDeleteId: number | null;
  categoryList: string[];
  onParChange: (itemId: number, stationId: number, value: string) => void;
  onToggleActive: (item: Item) => void;
  onRenameStart: (item: Item) => void;
  onRenameChange: (name: string) => void;
  onRenameCommit: () => void;
  onConfirmDelete: (id: number | null) => void;
  onCategoryChange: (item: Item, newCategory: Category) => void;
}

function ItemRow({
  item,
  allTargets,
  savingCells,
  editingItemId,
  editingName,
  renameInputRef,
  confirmDeleteId,
  categoryList,
  onParChange,
  onToggleActive,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onConfirmDelete,
  onCategoryChange,
}: ItemRowProps) {
  const isEditing = editingItemId === item.id;
  const isConfirmingDelete = confirmDeleteId === item.id;
  const [showCategorySelect, setShowCategorySelect] = useState(false);

  return (
    <div
      className={`grid grid-cols-[1fr_repeat(4,56px)] items-center px-2 py-2 border-b border-border-subtle last:border-b-0 ${
        !item.is_active ? 'opacity-50' : ''
      } hover:bg-surface-overlay/50 transition-colors`}
    >
      {/* Item name cell */}
      <div className="flex items-center gap-2 min-w-0 pr-2">
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
            className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-surface border border-dcvfd-accent text-xs text-zinc-100 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => onRenameStart(item)}
            className={`flex-1 min-w-0 text-left text-xs truncate ${
              item.is_active
                ? 'text-zinc-200 hover:text-dcvfd-accent'
                : 'text-zinc-500 line-through'
            } transition-colors`}
            title="Click to rename"
          >
            {item.name}
          </button>
        )}

        {/* Category change dropdown */}
        {showCategorySelect ? (
          <select
            value={item.category}
            onChange={(e) => {
              onCategoryChange(item, e.target.value as Category);
              setShowCategorySelect(false);
            }}
            onBlur={() => setShowCategorySelect(false)}
            autoFocus
            className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-surface border border-border-subtle text-zinc-300 focus:outline-none focus:ring-1 focus:ring-dcvfd-accent"
          >
            {categoryList.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setShowCategorySelect(true)}
            className="shrink-0 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Change category"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </button>
        )}

        {/* Active toggle / delete confirmation */}
        {isConfirmingDelete ? (
          <span className="shrink-0 flex items-center gap-1">
            <span className="text-[10px] text-red-400">Delete?</span>
            <button
              onClick={() => onToggleActive(item)}
              className="text-[10px] text-red-400 hover:text-red-300 font-medium"
            >
              Yes
            </button>
            <button
              onClick={() => onConfirmDelete(null)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 font-medium"
            >
              No
            </button>
          </span>
        ) : item.is_active ? (
          <button
            onClick={() => onConfirmDelete(item.id)}
            className="shrink-0 p-0.5 rounded text-zinc-600 hover:text-red-400 transition-colors"
            title="Deactivate item"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <button
            onClick={() => onToggleActive(item)}
            className="shrink-0 p-0.5 rounded text-emerald-600 hover:text-emerald-400 transition-colors"
            title="Reactivate item"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>

      {/* Station cells — 4 compact numeric inputs */}
      {STATION_IDS.map((sid) => {
        const key = targetKey(item.id, sid);
        const target = allTargets.get(key);
        const count = target?.target_count ?? 0;
        const isSaving = savingCells.has(key);

        return (
          <div
            key={sid}
            className={`flex items-center justify-center px-0.5 ${isSaving ? 'bg-amber-500/5' : ''}`}
          >
            <input
              type="text"
              inputMode="numeric"
              value={count === 0 ? '' : String(count)}
              onChange={(e) => onParChange(item.id, sid, e.target.value)}
              className={`w-12 px-1 py-1 rounded text-center text-xs font-mono bg-surface border text-zinc-100 focus:outline-none focus:ring-1 focus:ring-dcvfd-accent ${
                isSaving ? 'border-amber-500/40' : 'border-border-subtle'
              }`}
              placeholder="0"
            />
          </div>
        );
      })}
    </div>
  );
}
