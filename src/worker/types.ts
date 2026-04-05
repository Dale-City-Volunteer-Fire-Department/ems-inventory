export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  APP_NAME: string;
  ORG_NAME: string;
  AZURE_AD_CLIENT_ID: string;
  AZURE_AD_TENANT_ID: string;
  STATION_PIN: string;
  MAGIC_LINK_SECRET: string;
}
