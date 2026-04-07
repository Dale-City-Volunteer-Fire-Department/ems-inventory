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

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [confirmDeactivate, setConfirmDeactivate] = useState<number | null>(null);

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<Category>('Airway');
  const [newSortOrder, setNewSortOrder] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ items: Item[]; count: number }>('/items');
      setItems(data.items);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTargets = useCallback(async () => {
    try {
      const data = await apiFetch<{ stationId: number; targets: StockTarget[]; count: number }>(`/stock-targets?stationId=${targetStationId}`);
      setTargets(data.targets);
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
      const data = await apiFetch<{ item: Item }>('/items', {
        method: 'POST',
        body: {
          name: newName.trim(),
          category: newCategory,
          sort_order: newSortOrder ?? 0,
        },
      });
      setItems((prev) => [...prev, data.item]);
      setNewName('');
      setNewSortOrder(null);
      setTab('catalog');
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

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
        return 'bg-ems-red/15 text-ems-red border border-ems-red/20';
      case 'logistics':
        return 'bg-blue-500/15 text-blue-400 border border-blue-500/20';
      case 'crew':
        return 'bg-zinc-800 text-zinc-400 border border-border-subtle';
    }
  };

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'catalog', label: 'Item Catalog' },
    { id: 'targets', label: 'Stock Targets' },
    { id: 'add', label: 'Add Item' },
    { id: 'users', label: 'Users' },
  ];

  return (
    <div className="min-h-dvh bg-surface text-white pb-20 md:pb-6">
      <div className="px-4 py-4 border-b border-border-subtle">
        <h1 className="text-xl font-bold">Admin Panel</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Manage items, stock targets, and users</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-subtle overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              tab === t.id ? 'border-dcvfd-accent text-dcvfd-accent' : 'border-transparent text-zinc-400 hover:text-white'
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
            <div className="relative mb-4">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl bg-surface-raised border border-border-subtle pl-10 pr-3 py-2.5 text-white text-sm placeholder:text-zinc-500 outline-none focus:border-dcvfd-accent transition-colors"
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-dcvfd-accent border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between rounded-xl bg-surface-raised border border-border-subtle px-4 py-3 transition-all ${
                      !item.is_active ? 'opacity-40' : 'hover:border-zinc-600'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-white block truncate">{item.name}</span>
                      <span className="text-xs text-zinc-500">
                        {item.category} &middot; #{item.sort_order}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-95 ${
                        item.is_active
                          ? 'bg-ems-green/15 text-ems-green border border-ems-green/20'
                          : 'bg-zinc-800 text-zinc-500 border border-border-subtle'
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
              className="w-full rounded-xl bg-surface-raised border border-border-subtle px-3 py-2.5 text-white text-sm mb-4 focus:border-dcvfd-accent focus:outline-none transition-colors"
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="space-y-1.5">
              {targets.map((target) => {
                const item = items.find((i) => i.id === target.item_id);
                return (
                  <div
                    key={target.id}
                    className="flex items-center justify-between rounded-xl bg-surface-raised border border-border-subtle px-4 py-3"
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
              <label className="block text-sm text-zinc-400 mb-1.5">Item Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. NPA 28Fr"
                className="w-full rounded-xl bg-surface-raised border border-border-subtle px-3 py-2.5 text-white text-sm placeholder:text-zinc-500 outline-none focus:border-dcvfd-accent transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as Category)}
                className="w-full rounded-xl bg-surface-raised border border-border-subtle px-3 py-2.5 text-white text-sm focus:border-dcvfd-accent focus:outline-none transition-colors"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Sort Order</label>
              <NumericInput value={newSortOrder} onChange={setNewSortOrder} placeholder="0" aria-label="Sort order" />
            </div>

            <button
              type="button"
              onClick={handleAddItem}
              disabled={!newName.trim() || saving}
              className="w-full rounded-xl bg-dcvfd py-3.5 font-semibold text-white shadow-lg shadow-dcvfd/20 hover:bg-dcvfd-light active:bg-dcvfd-dark active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none min-h-[48px] transition-all"
            >
              {saving ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        )}

        {/* Users tab */}
        {tab === 'users' && (
          <div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full rounded-xl bg-surface-raised border border-border-subtle px-3 py-2.5 text-white text-sm mb-4 focus:border-dcvfd-accent focus:outline-none transition-colors"
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
                  <p className="text-zinc-500 text-sm text-center py-8">No users found.</p>
                )}
                {users.map((u) => {
                  const isSelf = currentUser?.email === u.email;
                  return (
                    <div
                      key={u.id}
                      className={`rounded-2xl bg-surface-raised border border-border-subtle px-4 py-3 transition-all ${!u.is_active ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white truncate">{u.name}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeClass(u.role)}`}>
                              {u.role}
                            </span>
                            {isSelf && (
                              <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium bg-dcvfd/30 text-dcvfd-accent border border-dcvfd-accent/20">
                                you
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 truncate mt-0.5">{u.email ?? 'No email'}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-600">
                            {u.station_name && <span>{u.station_name}</span>}
                            <span>Last login: {formatDate(u.last_login_at)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={u.role}
                            onChange={(e) => handleChangeRole(u.id, e.target.value as UserRole)}
                            disabled={isSelf}
                            className="rounded-lg bg-surface-overlay border border-border-subtle px-2 py-1.5 text-xs text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-dcvfd-accent focus:outline-none transition-colors"
                          >
                            <option value="crew">Crew</option>
                            <option value="logistics">Logistics</option>
                            <option value="admin">Admin</option>
                          </select>

                          {confirmDeactivate === u.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleToggleUserActive(u.id, false)}
                                className="rounded-full px-2 py-1 text-xs font-medium bg-ems-red/15 text-ems-red border border-ems-red/20 hover:bg-ems-red/25 transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeactivate(null)}
                                className="rounded-full px-2 py-1 text-xs font-medium bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleUserActive(u.id, !u.is_active)}
                              disabled={isSelf}
                              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 ${
                                u.is_active
                                  ? 'bg-ems-green/15 text-ems-green border border-ems-green/20'
                                  : 'bg-zinc-800 text-zinc-500 border border-border-subtle'
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
