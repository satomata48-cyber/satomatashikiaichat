# AI Chat Application 要件定義書

## 1. プロジェクト概要

### 1.1 プロジェクト名
**Satomata Shiki AI Chat** (仮称)

### 1.2 コンセプト
Perplexityのような検索機能とChatGPTのような対話機能を組み合わせた、マルチLLM対応のAIチャットアプリケーション

### 1.3 目標
- 複数のAI API（Together AI、ローカルLLM）を統合
- Web検索機能による最新情報の取得
- シンプルで直感的なUI/UX
- クロスプラットフォーム対応（Web → デスクトップ → モバイル）

### 1.4 利用目的
- 個人利用（非商用）

---

## 2. 技術スタック

### 2.1 フロントエンド
| 技術 | 用途 |
|------|------|
| SvelteKit | フレームワーク |
| TailwindCSS | スタイリング |
| TypeScript | 型安全性 |

### 2.2 バックエンド・インフラ
| 技術 | 用途 |
|------|------|
| Cloudflare Pages | ホスティング・デプロイ |
| Cloudflare D1 | SQLiteデータベース |
| Cloudflare Workers | サーバーレス関数 |

### 2.3 AI/API連携
| サービス | 用途 | 料金 |
|---------|------|------|
| Together AI | クラウドLLM API | 初回$5無料クレジット |
| Ollama | ローカルLLM連携 | 無料 |
| LM Studio | ローカルLLM連携 | 無料 |

### 2.4 Web検索API（推奨順）

| API | 料金 | 特徴 |
|-----|------|------|
| **Tavily** (推奨) | 毎月1,000クレジット無料 | AI検索に最適化、Together AIのドキュメントでも推奨 |
| **SearXNG** | 完全無料（セルフホスト） | プライバシー重視、242の検索エンジン集約 |
| **Exa** | $10無料クレジット | セマンティック検索、高品質 |

**推奨**: Tavilyを第一選択（毎月無料枠あり）、バックアップとしてSearXNG

### 2.5 クロスプラットフォーム対応
| プラットフォーム | 技術 | 優先度 |
|-----------------|------|--------|
| Web | SvelteKit + Cloudflare | 1st |
| Windows/Mac/Linux | **Tauri** | 2nd |
| iOS/Android | **PWA** または **Capacitor** | 3rd |

---

## 3. 機能要件

### 3.1 ページ構成

```
[ランディングページ] → [ログイン/登録] → [チャットページ]
        ↓                    ↓                   ↓
    サービス紹介         D1認証             メイン機能
```

### 3.2 ランディングページ
- [ ] サービス概要・特徴の紹介
- [ ] CTAボタン（サインアップ/ログイン）
- [ ] 機能ハイライト（検索、マルチLLM、プライバシー）
- [ ] スクリーンショット/デモ

### 3.3 認証システム（D1ベース）
- [ ] メールアドレス + パスワード認証
- [ ] セッション管理（JWTトークン）
- [ ] パスワードハッシュ化（bcrypt/argon2）
- [ ] ログイン状態の永続化

**※ OAuth不要（D1直接認証のみ）**

### 3.4 チャットページ（メイン機能）

#### 3.4.1 基本チャット機能
- [ ] メッセージ送信・受信
- [ ] ストリーミングレスポンス
- [ ] Markdown/コードハイライト対応
- [ ] チャット履歴の保存・読み込み

#### 3.4.2 AI検索機能（Perplexity風）
- [ ] Web検索の実行（Tavily API）
- [ ] 検索結果の要約
- [ ] ソース（引用元）の表示
- [ ] 検索モード切り替え（検索ON/OFF）

#### 3.4.3 マルチLLM対応
- [ ] Together AI（Llama, Mistral, Qwen等）
- [ ] ローカルLLM - **Ollama** (http://localhost:11434)
- [ ] ローカルLLM - **LM Studio** (http://localhost:1234)
- [ ] モデル切り替えUI
- [ ] API設定画面（エンドポイント・キー）

#### 3.4.4 会話管理
- [ ] 新規チャット作成
- [ ] チャット一覧（サイドバー）
- [ ] チャットの削除・リネーム
- [ ] チャットのエクスポート（JSON/Markdown）

---

## 4. 非機能要件

### 4.1 パフォーマンス
- 初回ロード: < 3秒
- チャットレスポンス開始: < 500ms
- ストリーミング表示: リアルタイム

### 4.2 セキュリティ
- HTTPS必須
- APIキーのクライアント側非露出
- パスワードハッシュ化
- CSRF対策
- Rate Limiting

### 4.3 プライバシー
- ユーザーデータは本人のみアクセス可能
- ローカルLLM使用時はデータがローカルに留まる

---

## 5. データモデル（D1）

```sql
-- ユーザーテーブル
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- セッションテーブル
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- チャットテーブル
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT DEFAULT 'New Chat',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- メッセージテーブル
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  sources TEXT, -- JSON: [{ title, url, snippet }]
  model TEXT, -- 使用したモデル名
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- ユーザー設定テーブル
CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY,
  default_model TEXT DEFAULT 'together-ai/meta-llama/Llama-3.3-70B-Instruct-Turbo',
  together_api_key TEXT, -- 暗号化
  local_llm_endpoint TEXT DEFAULT 'http://localhost:11434',
  local_llm_type TEXT DEFAULT 'ollama', -- 'ollama' | 'lmstudio'
  search_enabled INTEGER DEFAULT 1,
  theme TEXT DEFAULT 'dark',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX idx_chats_user_id ON chats(user_id);
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

---

## 6. 画面遷移図

```
┌─────────────────┐
│  ランディング   │
│    ページ       │
│    (/)          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   ログイン      │◄───►│   新規登録      │
│   (/login)      │     │   (/register)   │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         チャットページ (/chat)          │
│  ┌──────────┬─────────────────────────┐ │
│  │サイドバー │    チャットエリア      │ │
│  │          │                         │ │
│  │ + 新規   │  [検索ソース表示]       │ │
│  │ チャット │  [会話履歴]             │ │
│  │ 一覧     │  [入力エリア]           │ │
│  │          │  [モデル選択]           │ │
│  │ ⚙ 設定  │                         │ │
│  └──────────┴─────────────────────────┘ │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│    設定画面     │
│  (/settings)    │
│  - APIキー      │
│  - モデル選択   │
│  - テーマ       │
└─────────────────┘
```

---

## 7. LLM対応詳細

### 7.1 Together AI
```typescript
// エンドポイント
const TOGETHER_API = 'https://api.together.xyz/v1/chat/completions';

// 推奨モデル
const MODELS = [
  'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  'meta-llama/Llama-3.1-8B-Instruct-Turbo',
  'mistralai/Mixtral-8x7B-Instruct-v0.1',
  'Qwen/Qwen2.5-72B-Instruct-Turbo',
  'deepseek-ai/DeepSeek-V3',
];
```

### 7.2 Ollama（ローカル）
```typescript
// エンドポイント
const OLLAMA_API = 'http://localhost:11434/api/chat';

// OpenAI互換エンドポイント
const OLLAMA_OPENAI = 'http://localhost:11434/v1/chat/completions';
```

### 7.3 LM Studio（ローカル）
```typescript
// エンドポイント（OpenAI互換）
const LMSTUDIO_API = 'http://localhost:1234/v1/chat/completions';
```

---

## 8. 検索API詳細

### 8.1 Tavily API（推奨）
```typescript
// エンドポイント
const TAVILY_API = 'https://api.tavily.com/search';

// リクエスト例
{
  "api_key": "tvly-xxx",
  "query": "検索クエリ",
  "search_depth": "basic", // or "advanced"
  "include_answer": true,
  "max_results": 5
}

// 料金: 毎月1,000クレジット無料
// Basic検索 = 1クレジット
// Advanced検索 = 2クレジット
```

### 8.2 SearXNG（バックアップ/セルフホスト）
```typescript
// パブリックインスタンス例
const SEARXNG_API = 'https://searx.be/search';

// リクエスト
GET /search?q=query&format=json&categories=general
```

---

## 9. クロスプラットフォーム戦略

### 9.1 開発優先順位

```
1. Webアプリ（SvelteKit + Cloudflare）
   ↓
2. デスクトップアプリ（Tauri）
   ↓
3. モバイルアプリ（PWA / Capacitor）
```

### 9.2 Tauri（デスクトップ）

**メリット:**
- SvelteKitのコードをそのまま再利用
- 軽量（~5-10MB vs Electron ~150MB+）
- ローカルLLM（Ollama/LM Studio）との連携が容易
- Rust製でセキュア

**追加機能（デスクトップ版のみ）:**
- システムトレイ常駐
- グローバルショートカット
- ファイルシステムアクセス

### 9.3 PWA / Capacitor（モバイル）

**PWA（Progressive Web App）推奨:**
- インストール不要
- オフライン対応可能
- プッシュ通知対応
- ストア申請不要

---

## 10. 開発フェーズ

### Phase 1: MVP（最小実装）
1. SvelteKit + TailwindCSSプロジェクト初期化
2. ランディングページ作成
3. D1認証システム実装（登録/ログイン）
4. 基本チャットUI作成
5. Together AI連携
6. Cloudflare Pages/D1デプロイ

### Phase 2: 検索機能
1. Tavily API連携
2. 検索結果の要約・表示
3. ソース引用UI

### Phase 3: 拡張機能
1. Ollama対応
2. LM Studio対応
3. チャット履歴管理
4. 設定画面

### Phase 4: デスクトップアプリ
1. Tauriセットアップ
2. ローカルLLM連携最適化
3. システムトレイ・ショートカット

### Phase 5: モバイル対応
1. PWA対応（manifest.json, Service Worker）
2. レスポンシブUI調整
3. （オプション）Capacitorでネイティブ化

---

## 11. 確定事項まとめ

| 項目 | 決定内容 |
|------|---------|
| 認証 | D1データベース認証のみ（OAuth不要） |
| 検索API | Tavily（毎月1,000クレジット無料） |
| ローカルLLM | Ollama + LM Studio 両対応 |
| 優先順位 | Web → デスクトップ → モバイル |
| 課金機能 | 不要（個人利用） |

---

## 12. 次のステップ

要件定義が完了しました。次に進む準備ができています：

1. **プロジェクト初期化**
   - SvelteKit + TailwindCSS + TypeScript
   - Cloudflare Pages/D1設定

2. **Phase 1実装開始**
   - ランディングページ
   - 認証システム
   - チャットUI
   - Together AI連携

実装を開始しますか？
