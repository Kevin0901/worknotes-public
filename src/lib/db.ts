import "server-only";
import postgres from "postgres";
import { databaseUrl } from "./env";
import { seedDatabase } from "./seed";

export type Sql = postgres.Sql;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("尚未設定資料庫（DATABASE_URL）");
    this.name = "DatabaseNotConfiguredError";
  }
}

declare global {
  var __worknotesSql: Sql | undefined;
  var __worknotesInit: Promise<void> | undefined;
}

/**
 * 建立連線。Neon 的連線字串可能帶有 channel_binding 等參數，
 * postgres.js 會把未知參數當成伺服器設定送出而導致錯誤，因此先清掉，SSL 另外指定。
 */
function createClient(raw: string): Sql {
  const url = new URL(raw);
  const sslmode = url.searchParams.get("sslmode");
  for (const key of [...url.searchParams.keys()]) {
    if (key !== "application_name") url.searchParams.delete(key);
  }
  const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  const ssl = sslmode === "disable" ? false : sslmode || !isLocal ? ("require" as const) : false;
  return postgres(url.toString(), {
    ssl,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // 相容 PgBouncer（Neon pooled 連線）
    onnotice: () => {},
  });
}

function client(): Sql {
  if (!globalThis.__worknotesSql) {
    const url = databaseUrl();
    if (!url) throw new DatabaseNotConfiguredError();
    globalThis.__worknotesSql = createClient(url);
  }
  return globalThis.__worknotesSql;
}

const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  picture text,
  status text NOT NULL DEFAULT 'pending',
  role text NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categories_parent_idx ON categories (parent_id);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  icon text,
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS notes_category_idx ON notes (category_id);

CREATE TABLE IF NOT EXISTS note_revisions (
  id bigserial PRIMARY KEY,
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  edited_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS note_revisions_note_idx ON note_revisions (note_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_logs (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  path text,
  method text,
  actor text,
  actor_type text NOT NULL DEFAULT 'anonymous',
  ip text,
  country text,
  city text,
  user_agent text,
  detail text
);
CREATE INDEX IF NOT EXISTS access_logs_created_idx ON access_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS access_logs_event_idx ON access_logs (event, created_at DESC);

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'google',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  ip text,
  country text,
  city text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS login_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  session_hours integer,
  decided_at timestamptz,
  ip text,
  country text,
  city text,
  user_agent text
);

CREATE TABLE IF NOT EXISTS calendar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'event',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'todo',
  color text,
  visibility text NOT NULL DEFAULT 'private',
  note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS calendar_items_starts_idx ON calendar_items (starts_at);
`;

/**
 * 資料庫結構升級：依序執行，已執行過的版本記在 app_settings.schema_version，不會重複執行。
 * 只能在陣列最後面新增，不可修改已上線的項目。
 */
const MIGRATIONS: string[] = [
  // 1：空間（公共區／個人空間）、擁有者與可見度。既有資料放在公共區、他人可看可編輯（與舊行為相同）
  `
  ALTER TABLE categories ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES app_users(id) ON DELETE SET NULL;
  ALTER TABLE categories ADD COLUMN IF NOT EXISTS space_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;
  ALTER TABLE categories ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'edit';
  ALTER TABLE notes ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES app_users(id) ON DELETE SET NULL;
  ALTER TABLE notes ADD COLUMN IF NOT EXISTS space_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;
  ALTER TABLE notes ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'edit';
  ALTER TABLE app_users ADD COLUMN IF NOT EXISTS space_hidden boolean NOT NULL DEFAULT false;
  CREATE INDEX IF NOT EXISTS notes_space_idx ON notes (space_user_id);
  CREATE INDEX IF NOT EXISTS categories_space_idx ON categories (space_user_id);
  `,
  // 2：互動教學頁與 AI 助理（使用者自己的 API 金鑰、對話紀錄）
  // 教學頁沿用相同的空間／擁有者／可見度規則：放在公共區、擁有者為管理員（owner_id 為 NULL）。
  `
  CREATE TABLE IF NOT EXISTS guide_pages (
    slug text PRIMARY KEY,
    title text NOT NULL,
    icon text,
    owner_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
    space_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
    visibility text NOT NULL DEFAULT 'read',
    sort_order integer NOT NULL DEFAULT 0,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS ai_credentials (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    label text,
    key_hint text NOT NULL,
    secret text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    expires_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS ai_credentials_user_idx ON ai_credentials (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS ai_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    title text NOT NULL,
    provider text,
    model text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS ai_conversations_user_idx ON ai_conversations (user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS ai_messages (
    id bigserial PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    sources jsonb NOT NULL DEFAULT '[]',
    provider text,
    model text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai_messages (conversation_id, id);
  `,
  // 3：AI 自訂端點（OpenAI 相容 API 網址；direct = 由瀏覽器直接連線的本機服務，例如 Ollama）
  `
  ALTER TABLE ai_credentials ADD COLUMN IF NOT EXISTS base_url text;
  ALTER TABLE ai_credentials ADD COLUMN IF NOT EXISTS direct boolean NOT NULL DEFAULT false;
  `,
  // 4：（保留版本號；公開版沒有內建教學頁）
  `SELECT 1;`,
];

async function migrate(tx: Sql): Promise<void> {
  const rows = await tx<{ value: unknown }[]>`SELECT value FROM app_settings WHERE key = 'schema_version'`;
  const current = typeof rows[0]?.value === "number" ? rows[0].value : 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await tx.unsafe(MIGRATIONS[v]);
  }
  if (current < MIGRATIONS.length) {
    await tx`
      INSERT INTO app_settings (key, value) VALUES ('schema_version', ${tx.json(MIGRATIONS.length)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  }
}

async function initialize(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    // 以 advisory lock 避免多個 Serverless 執行個體同時建表或重複匯入預設筆記
    await tx`SELECT pg_advisory_xact_lock(7240001)`;
    await tx.unsafe(SCHEMA);
    await migrate(tx as unknown as Sql);
    await seedDatabase(tx as unknown as Sql);
  });
}

/** 取得已初始化（建表＋預設資料）的資料庫連線 */
export async function db(): Promise<Sql> {
  const sql = client();
  if (!globalThis.__worknotesInit) {
    globalThis.__worknotesInit = initialize(sql).catch((err) => {
      globalThis.__worknotesInit = undefined;
      throw err;
    });
  }
  await globalThis.__worknotesInit;
  return sql;
}
