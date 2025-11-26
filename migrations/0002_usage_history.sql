-- Migration: 0002_usage_history
-- Created: 2024-11-26
-- Description: Add usage history table for tracking daily usage

-- 使用履歴テーブル（日別の使用回数を記録）
CREATE TABLE IF NOT EXISTS usage_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD形式
  message_count INTEGER DEFAULT 0, -- テキストメッセージ数
  image_count INTEGER DEFAULT 0, -- 画像生成数
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, date)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_usage_history_user_date ON usage_history(user_id, date);
