import { useState, useEffect, useCallback } from 'react';
import type { Item, StockTarget, Category, UserRole } from '@shared/types';
import { CATEGORIES } from '@shared/categories';
import { apiFetch } from '../hooks/useApi';
import { useStations } from '../hooks/useStations';
import { useAuth } from '../hooks/useAuth';
import NumericInput from '../components/NumericInput';

type AdminTab = 'catalog' | 'targets' | 'add' | 'users';

interface UserRecord {
  id: number;
  email: string | null;
  name: string;
  role: UserRole;
  station_id: number | null;
  station_name: string | null;
  auth_method: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export default function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>('catalog');
  const [items, setItems] = useState<Item[]>([]);
  const [targets, setTargets] = useState<StockTarget[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { stations } = useStations();
  const { user: currentUser } = useAuth();
  const [targetStationId, setTargetStationId] = useState<number>(stations[0]?.id ?? 10);

  // Users tab state
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [confirmDeactivate, setConfirmDeactivate] = useState<number | null>(null);

  // New item form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<Category>('Airway');
  const [newSortOrder, setNewSortOrder] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Item[]>('/items');
      setItems(data);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTargets = useCallback(async () => {
    try {
      const data = await apiFetch<StockTarget[]>(`/stock-targets?stationId=${targetStationId}`);
      setTargets(data);
    } catch {
      // handle error
    }
  }, [targetStationId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase()),
  );

  const handleToggleActive = async (item: Item) => {
    try {
      await apiFetch(`/items/${item.id}`, {
        method: 'PUT',
        body: { is_active: !item.is_active },
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i)));
    } catch {
      // handle error
    }
  };

  const handleUpdateTarget = async (target: StockTarget, newCount: number | null) => {
    if (newCount === null) return;
    try {
      await apiFetch(`/stock-targets/${target.id}`, {
        method: 'PUT',
        body: { target_count: newCount },
      });
      setTargets((prev) => prev.map((t) => (t.id === target.id ? { ...t, target_count: newCount } : t)));
    } catch {
      // handle error
    }
  };

  const handleAddItem = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const item = await apiFetch<Item>('/items', {
        method: 'POST',
        body: {
          name: newName.trim(),
          category: newCategory,
          sort_order: newSortOrder ?? 0,
        },
      });
      setItems((prev) => [...prev, item]);
      setNewName('');
      setNewSortOrder(null);
      setTab('catalog');
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  // ── Users tab logic ─────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.set('role', roleFilter);
      const qs = params.toString();
      const data = await apiFetch<{ users: UserRecord[]; count: number }>(`/users${qs ? `?${qs}` : ''}`);
      setUsers(data.users);
    } catch {
      // handle error
    } finally {
      setUsersLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => {
    if (tab === 'users') {
      loadUsers();
    }
  }, [tab, loadUsers]);

  const handleChangeRole = async (userId: number, newRole: UserRole) => {
    try {
      const data = await apiFetch<{ user: UserRecord }>(`/users/${userId}/role`, {
        method: 'PUT',
        body: { role: newRole },
      });
      if (data.user) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      }
    } catch {
      // handle error
    }
  };

  const handleToggleUserActive = async (userId: number, newActive: boolean) => {
    // If deactivating, require confirmation
    if (!newActive && confirmDeactivate !== userId) {
      setConfirmDeactivate(userId);
      return;
    }
    setConfirmDeactivate(null);
    try {
      const data = await apiFetch<{ user: UserRecord }>(`/users/${userId}/active`, {
        method: 'PUT',
        body: { is_active: newActive },
      });
      if (data.user) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      }
    } catch {
      // handle error
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const roleBadgeClass = (role: UserRole): string => {
    switch (role) {
      case 'admin':
        return 'bg-red-900/80 text-red-300';
      case 'logistics':
        return 'bg-blue-900/80 text-blue-300';
      case 'crew':
        return 'bg-neutral-700 text-neutral-300';
    }
  };

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'catalog', label: 'Item Catalog' },
    { id: 'targets', label: 'Stock Targets' },
    { id: 'add', label: 'Add Item' },
    { id: 'users', label: 'Users' },
  ];

  return (
    <div className="min-h-dvh bg-neutral-950 text-white pb-20 md:pb-6">
      <div className="px-4 py-4 border-b border-neutral-800">
        <h1 className="text-xl font-bold">Admin Panel</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 overflow-x-auto">
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
        {/* Catalog tab */}
        {tab === 'catalog' && (
          <div>
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-white text-sm mb-4 placeholder:text-neutral-500 outline-none focus:border-dcvfd-accent"
            />

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-dcvfd-accent border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="space-y-1">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between rounded-lg bg-neutral-800 px-4 py-3 ${
                      !item.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-white block truncate">{item.name}</span>
                      <span className="text-xs text-neutral-500">
                        {item.category} &middot; #{item.sort_order}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                        item.is_active ? 'bg-green-900/80 text-green-300' : 'bg-neutral-700 text-neutral-400'
                      }`}
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Targets tab */}
        {tab === 'targets' && (
          <div>
            <select
              value={targetStationId}
              onChange={(e) => setTargetStationId(Number(e.target.value))}
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-white text-sm mb-4"
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="space-y-1">
              {targets.map((target) => {
                const item = items.find((i) => i.id === target.item_id);
                return (
                  <div
                    key={target.id}
                    className="flex items-center justify-between rounded-lg bg-neutral-800 px-4 py-3"
                  >
                    <span className="text-sm text-white flex-1 min-w-0 truncate">
                      {item?.name ?? `Item #${target.item_id}`}
                    </span>
                    <NumericInput
                      value={target.target_count}
                      onChange={(v) => handleUpdateTarget(target, v)}
                      aria-label={`PAR level for ${item?.name ?? 'item'}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add item tab */}
        {tab === 'add' && (
          <div className="max-w-sm space-y-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Item Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. NPA 28Fr"
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-white text-sm placeholder:text-neutral-500 outline-none focus:border-dcvfd-accent"
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as Category)}
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-white text-sm"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">Sort Order</label>
              <NumericInput value={newSortOrder} onChange={setNewSortOrder} placeholder="0" aria-label="Sort order" />
            </div>

            <button
              type="button"
              onClick={handleAddItem}
              disabled={!newName.trim() || saving}
              className="w-full rounded-lg bg-dcvfd py-3 font-semibold text-white hover:bg-dcvfd-light active:bg-dcvfd-dark disabled:bg-neutral-700 disabled:text-neutral-500 min-h-[48px]"
            >
              {saving ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        )}

        {/* Users tab */}
        {tab === 'users' && (
          <div>
            {/* Role filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2.5 text-white text-sm mb-4"
            >
              <option value="all">All Roles</option>
              <option value="crew">Crew</option>
              <option value="logistics">Logistics</option>
              <option value="admin">Admin</option>
            </select>

            {usersLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-dcvfd-accent border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="space-y-2">
                {users.length === 0 && (
                  <p className="text-neutral-500 text-sm text-center py-8">No users found.</p>
                )}
                {users.map((u) => {
                  const isSelf = currentUser?.email === u.email;
                  return (
                    <div
                      key={u.id}
                      className={`rounded-lg bg-neutral-800 px-4 py-3 ${!u.is_active ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white truncate">{u.name}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeClass(u.role)}`}>
                              {u.role}
                            </span>
                            {isSelf && (
                              <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium bg-dcvfd/30 text-dcvfd-accent">
                                you
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 truncate mt-0.5">{u.email ?? 'No email'}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
                            {u.station_name && <span>{u.station_name}</span>}
                            <span>Last login: {formatDate(u.last_login_at)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Role dropdown */}
                          <select
                            value={u.role}
                            onChange={(e) => handleChangeRole(u.id, e.target.value as UserRole)}
                            disabled={isSelf}
                            className="rounded-lg bg-neutral-700 border border-neutral-600 px-2 py-1.5 text-xs text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="crew">Crew</option>
                            <option value="logistics">Logistics</option>
                            <option value="admin">Admin</option>
                          </select>

                          {/* Active toggle */}
                          {confirmDeactivate === u.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleToggleUserActive(u.id, false)}
                                className="rounded-full px-2 py-1 text-xs font-medium bg-red-900/80 text-red-300 hover:bg-red-800"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeactivate(null)}
                                className="rounded-full px-2 py-1 text-xs font-medium bg-neutral-700 text-neutral-400 hover:text-white"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleUserActive(u.id, !u.is_active)}
                              disabled={isSelf}
                              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                                u.is_active ? 'bg-green-900/80 text-green-300' : 'bg-neutral-700 text-neutral-400'
                              }`}
                            >
                              {u.is_active ? 'Active' : 'Inactive'}
                            </button>
                          )}
                        </div>
                      </div>
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
