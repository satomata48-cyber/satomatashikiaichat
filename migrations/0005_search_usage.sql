-- WEB検索使用量テーブル（毎月1日リセット、ユーザーごと1000件まで）
CREATE TABLE IF NOT EXISTS search_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    year_month TEXT NOT NULL,  -- YYYY-MM形式
    usage_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_search_usage_user_month ON search_usage(user_id, year_month);
