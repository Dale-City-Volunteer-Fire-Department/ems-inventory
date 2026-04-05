import { UserRole } from './types';

export const ROLES: Record<UserRole, { label: string; description: string }> = {
  crew: { label: 'Station Crew', description: 'Submit inventory counts' },
  logistics: { label: 'Logistics', description: 'View shortages, manage pick lists and deliveries' },
  admin: { label: 'Admin', description: 'Manage items, PAR levels, users, and system config' },
};
