-- Migration: 0003_prompt_templates
-- Created: 2024-11-26
-- Description: Add prompt templates table

-- テンプレートプロンプトテーブル
CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,           -- テンプレート名（例: "丁寧な回答", "コード解説"）
  content TEXT NOT NULL,        -- プロンプト内容
  is_default INTEGER DEFAULT 0, -- デフォルトで使用するか
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_id ON prompt_templates(user_id);
