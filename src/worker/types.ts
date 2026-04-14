export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  ASSETS: Fetcher;
  ATTACHMENTS: R2Bucket;
  APP_NAME: string;
  ORG_NAME: string;
  AZURE_AD_CLIENT_ID: string;
  AZURE_AD_TENANT_ID: string;
  AZURE_AD_CLIENT_SECRET: string;
  STATION_PIN: string;
  RESEND_API_KEY: string;
}
