// Shared API response type definitions
// These types are the compile-time bridge between worker handlers and frontend consumers.
// If either side changes the shape, TypeScript catches the mismatch.

import type { Item, Station, StockTarget, InventoryHistory, Order, Category, UserRole } from './types';

// ── GET responses ────────────────────────────────────────────────

export interface StationsResponse {
  stations: Station[];
}

export interface ItemsResponse {
  items: Item[];
  count: number;
}

export interface StockTargetsResponse {
  stationId: number;
  targets: StockTarget[];
  count: number;
}

export interface InventoryTemplateItem {
  id: number;
  item_id: number;
  station_id: number;
  target_count: number;
  actual_count: null;
  delta: null;
  status: 'not_entered';
  session_id: null;
  name: string;
  category: Category;
  sort_order: number;
}

// GET /api/inventory/current/:stationId returns InventoryTemplateItem[] (raw array, no envelope)

export interface InventorySessionsResponse {
  sessions: InventorySession[];
  count: number;
}

export interface InventorySession {
  id: number;
  station_id: number;
  station_name: string;
  submitted_by: string | null;
  submitted_at: string;
  item_count: number;
  items_short: number;
}

export interface InventoryHistoryResponse {
  history: InventoryHistory[];
  count: number;
}

export interface OrdersResponse {
  orders: Order[];
  count: number;
}

export interface UsersResponse {
  users: UserRecord[];
  count: number;
}

export interface UserRecord {
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

// ── Mutation responses ───────────────────────────────────────────

export interface ItemResponse {
  item: Item;
}

export interface UserResponse {
  user: UserRecord;
}

export interface StockTargetUpdateResponse {
  itemId: number;
  stationId: number;
  targetCount: number;
}

export interface OrderUpdateResponse {
  orderId: number;
  status: string;
}

export interface InventorySubmitResponse {
  sessionId: number;
  itemCount: number;
  itemsShort: number;
  orderId: number | null;
  message: string;
}

// ── Dashboard ────────────────────────────────────────────────────

export interface DashboardStatsResponse {
  stations: DashboardStationData[];
  categoryShortages: { category: string; count: number }[];
  orderPipeline: { pending: number; inProgress: number; filled: number };
  recentSessions: DashboardRecentSession[];
}

export interface DashboardStationData {
  stationId: number;
  stationName: string;
  stationCode: string;
  lastSubmission: string | null;
  itemCount: number;
  itemsShort: number;
  shortages: { itemName: string; category: string; target: number; actual: number; delta: number }[];
}

export interface DashboardRecentSession {
  id: number;
  stationName: string;
  submittedAt: string;
  submittedBy: string | null;
  itemCount: number;
  itemsShort: number;
}

// ── Health ───────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  app: string;
  timestamp: string;
}

// ── Auth ─────────────────────────────────────────────────────────

export interface AuthMeResponse {
  userId: number;
  email: string | null;
  name: string;
  role: UserRole;
  stationId: number | null;
  authMethod: string;
  photoUrl: string | null;
  expiresAt: string;
}
