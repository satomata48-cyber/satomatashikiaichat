import type { D1Database } from '@cloudflare/workers-types';

export interface User {
	id: string;
	email: string;
	password_hash: string;
	created_at: string;
}

export interface Session {
	id: string;
	user_id: string;
	token: string;
	expires_at: string;
	created_at: string;
}

export interface Chat {
	id: string;
	user_id: string;
	title: string;
	created_at: string;
	updated_at: string;
}

export interface Message {
	id: string;
	chat_id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	sources: string | null;
	created_at: string;
}

// User operations
export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
	const result = await db
		.prepare('SELECT * FROM users WHERE email = ?')
		.bind(email)
		.first<User>();
	return result || null;
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
	const result = await db
		.prepare('SELECT * FROM users WHERE id = ?')
		.bind(id)
		.first<User>();
	return result || null;
}

// Session operations
export async function createSession(
	db: D1Database,
	userId: string,
	token: string,
	expiresAt: Date
): Promise<Session> {
	const id = crypto.randomUUID();
	await db
		.prepare(
			'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)'
		)
		.bind(id, userId, token, expiresAt.toISOString())
		.run();

	return { id, user_id: userId, token, expires_at: expiresAt.toISOString(), created_at: new Date().toISOString() };
}

export async function getSessionByToken(db: D1Database, token: string): Promise<Session | null> {
	const result = await db
		.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")')
		.bind(token)
		.first<Session>();
	return result || null;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
	await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

// Chat operations
export async function createChat(
	db: D1Database,
	userId: string,
	title: string
): Promise<Chat> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await db
		.prepare(
			'INSERT INTO chats (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
		)
		.bind(id, userId, title, now, now)
		.run();

	return { id, user_id: userId, title, created_at: now, updated_at: now };
}

export async function getChatsByUser(db: D1Database, userId: string): Promise<Chat[]> {
	const result = await db
		.prepare('SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC')
		.bind(userId)
		.all<Chat>();
	return result.results || [];
}

export async function getChatById(db: D1Database, id: string): Promise<Chat | null> {
	const result = await db
		.prepare('SELECT * FROM chats WHERE id = ?')
		.bind(id)
		.first<Chat>();
	return result || null;
}

export async function updateChatTitle(db: D1Database, id: string, title: string): Promise<void> {
	await db
		.prepare('UPDATE chats SET title = ?, updated_at = datetime("now") WHERE id = ?')
		.bind(title, id)
		.run();
}

export async function deleteChat(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM messages WHERE chat_id = ?').bind(id).run();
	await db.prepare('DELETE FROM chats WHERE id = ?').bind(id).run();
}

// Message operations
export async function createMessage(
	db: D1Database,
	chatId: string,
	role: 'user' | 'assistant' | 'system',
	content: string,
	sources?: string
): Promise<Message> {
	const id = crypto.randomUUID();
	await db
		.prepare(
			'INSERT INTO messages (id, chat_id, role, content, sources) VALUES (?, ?, ?, ?, ?)'
		)
		.bind(id, chatId, role, content, sources || null)
		.run();

	// Update chat's updated_at
	await db
		.prepare('UPDATE chats SET updated_at = datetime("now") WHERE id = ?')
		.bind(chatId)
		.run();

	return { id, chat_id: chatId, role, content, sources: sources || null, created_at: new Date().toISOString() };
}

export async function getMessagesByChat(db: D1Database, chatId: string): Promise<Message[]> {
	const result = await db
		.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
		.bind(chatId)
		.all<Message>();
	return result.results || [];
}

// チャットとメッセージを1クエリで取得（高速化）
export async function getChatWithMessages(
	db: D1Database,
	chatId: string,
	userId: string
): Promise<{ chat: Chat; messages: Message[] } | null> {
	// チャットの権限確認とメッセージ取得を1回のバッチで実行
	const [chatResult, messagesResult] = await db.batch([
		db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').bind(chatId, userId),
		db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC').bind(chatId)
	]);

	const chat = chatResult.results?.[0] as Chat | undefined;
	if (!chat) return null;

	return {
		chat,
		messages: (messagesResult.results as Message[]) || []
	};
}

// Usage history operations
export interface UsageHistory {
	id: string;
	user_id: string;
	date: string;
	message_count: number;
	image_count: number;
	created_at: string;
	updated_at: string;
}

// 使用履歴を記録（UPSERT: 同じ日付なら更新、なければ挿入）
export async function recordUsage(
	db: D1Database,
	userId: string,
	type: 'message' | 'image'
): Promise<void> {
	const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
	const id = crypto.randomUUID();

	if (type === 'message') {
		await db
			.prepare(`
				INSERT INTO usage_history (id, user_id, date, message_count, image_count)
				VALUES (?, ?, ?, 1, 0)
				ON CONFLICT(user_id, date) DO UPDATE SET
					message_count = message_count + 1,
					updated_at = CURRENT_TIMESTAMP
			`)
			.bind(id, userId, today)
			.run();
	} else {
		await db
			.prepare(`
				INSERT INTO usage_history (id, user_id, date, message_count, image_count)
				VALUES (?, ?, ?, 0, 1)
				ON CONFLICT(user_id, date) DO UPDATE SET
					image_count = image_count + 1,
					updated_at = CURRENT_TIMESTAMP
			`)
			.bind(id, userId, today)
			.run();
	}
}

// 月別の使用履歴を取得
export async function getUsageHistory(
	db: D1Database,
	userId: string,
	year: number,
	month: number
): Promise<{ date: string; count: number }[]> {
	const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
	const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

	const result = await db
		.prepare(`
			SELECT date, (message_count + image_count) as count
			FROM usage_history
			WHERE user_id = ? AND date >= ? AND date <= ?
			ORDER BY date ASC
		`)
		.bind(userId, startDate, endDate)
		.all<{ date: string; count: number }>();

	return result.results || [];
}

// Prompt Template operations
export interface PromptTemplate {
	id: string;
	user_id: string;
	name: string;
	content: string;
	is_default: number;
	created_at: string;
	updated_at: string;
}

export async function getPromptTemplates(
	db: D1Database,
	userId: string
): Promise<PromptTemplate[]> {
	const result = await db
		.prepare('SELECT * FROM prompt_templates WHERE user_id = ? ORDER BY created_at ASC')
		.bind(userId)
		.all<PromptTemplate>();
	return result.results || [];
}

export async function getPromptTemplateById(
	db: D1Database,
	id: string,
	userId: string
): Promise<PromptTemplate | null> {
	const result = await db
		.prepare('SELECT * FROM prompt_templates WHERE id = ? AND user_id = ?')
		.bind(id, userId)
		.first<PromptTemplate>();
	return result || null;
}

export async function createPromptTemplate(
	db: D1Database,
	userId: string,
	name: string,
	content: string
): Promise<PromptTemplate> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await db
		.prepare('INSERT INTO prompt_templates (id, user_id, name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(id, userId, name, content, now, now)
		.run();
	return { id, user_id: userId, name, content, is_default: 0, created_at: now, updated_at: now };
}

export async function updatePromptTemplate(
	db: D1Database,
	id: string,
	userId: string,
	name: string,
	content: string
): Promise<void> {
	await db
		.prepare('UPDATE prompt_templates SET name = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
		.bind(name, content, id, userId)
		.run();
}

export async function deletePromptTemplate(
	db: D1Database,
	id: string,
	userId: string
): Promise<void> {
	await db
		.prepare('DELETE FROM prompt_templates WHERE id = ? AND user_id = ?')
		.bind(id, userId)
		.run();
}
