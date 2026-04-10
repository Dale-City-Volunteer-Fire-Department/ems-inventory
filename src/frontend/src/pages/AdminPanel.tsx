import { useState, useEffect, useCallback } from 'react';
import type { UserRole } from '@shared/types';
import { apiFetch } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';

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
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [confirmDeactivate, setConfirmDeactivate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.set('role', roleFilter);
      const qs = params.toString();
      const data = await apiFetch<{ users: UserRecord[]; count: number }>(`/users${qs ? `?${qs}` : ''}`);
      setUsers(data.users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleChangeRole = async (userId: number, newRole: UserRole) => {
    try {
      const data = await apiFetch<{ user: UserRecord }>(`/users/${userId}/role`, {
        method: 'PUT',
        body: { role: newRole },
      });
      if (data.user) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user status');
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

  return (
    <div className="min-h-dvh bg-surface text-white pb-20 md:pb-6">
      <div className="px-4 py-4 border-b border-border-subtle">
        <h1 className="text-xl font-bold">Admin Panel</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Manage users</p>
      </div>

      <div className="px-4 py-4 md:max-w-6xl md:mx-auto">
        {error && (
          <div className="flex items-center justify-between gap-2 mb-4 px-3 py-2 rounded-xl bg-red-950/50 border border-red-900/50 text-sm text-red-300">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-200 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
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
    </div>
  );
}
