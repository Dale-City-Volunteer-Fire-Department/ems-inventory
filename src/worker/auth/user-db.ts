import type { UserRole } from '../../shared/types';

// ── Types ──────────────────────────────────────────────────────────

export interface UserRecord {
  id: number;
  email: string | null;
  name: string;
  role: UserRole;
  authMethod: 'entra_sso' | 'pin';
  stationId: number | null;
  isActive: boolean;
}

// ── Upsert ─────────────────────────────────────────────────────────

/**
 * Create or update a user record based on email + auth_method.
 * For SSO users, email is the unique key.
 * Returns the user record with current role (does not overwrite role on update).
 */
export async function upsertUser(
  db: D1Database,
  data: { email: string; name: string; authMethod: 'entra_sso' },
): Promise<UserRecord | null> {
  // Check if user already exists
  const existing = await db
    .prepare('SELECT id, email, name, role, auth_method, station_id, is_active FROM users WHERE email = ?')
    .bind(data.email)
    .first<{
      id: number;
      email: string;
      name: string;
      role: string;
      auth_method: string;
      station_id: number | null;
      is_active: number;
    }>();

  if (existing) {
    // Reject deactivated users — do not create a session
    if (existing.is_active === 0) {
      return null;
    }

    // Update name and auth_method if changed, but preserve role
    await db
      .prepare('UPDATE users SET name = ?, auth_method = ? WHERE id = ?')
      .bind(data.name, data.authMethod, existing.id)
      .run();

    return {
      id: existing.id,
      email: existing.email,
      name: data.name,
      role: existing.role as UserRole,
      authMethod: data.authMethod,
      stationId: existing.station_id,
      isActive: existing.is_active === 1,
    };
  }

  // Create new user with default role 'crew'
  const result = await db
    .prepare('INSERT INTO users (email, name, role, auth_method) VALUES (?, ?, ?, ?)')
    .bind(data.email, data.name, 'crew', data.authMethod)
    .run();

  return {
    id: result.meta.last_row_id as number,
    email: data.email,
    name: data.name,
    role: 'crew',
    authMethod: data.authMethod,
    stationId: null,
    isActive: true,
  };
}
