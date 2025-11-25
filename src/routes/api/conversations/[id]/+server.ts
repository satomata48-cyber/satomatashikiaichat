import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChatById, getChatWithMessages, deleteChat, updateChatTitle } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!platform?.env?.DB) {
		return json({ error: 'Database not available' }, { status: 500 });
	}

	// 1回のバッチクエリでチャットとメッセージを取得（高速化）
	const result = await getChatWithMessages(platform.env.DB, params.id, locals.user.id);

	if (!result) {
		return json({ error: 'Chat not found' }, { status: 404 });
	}

	return json({ conversation: result.chat, messages: result.messages });
};

export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!platform?.env?.DB) {
		return json({ error: 'Database not available' }, { status: 500 });
	}

	const chat = await getChatById(platform.env.DB, params.id);
	if (!chat || chat.user_id !== locals.user.id) {
		return json({ error: 'Chat not found' }, { status: 404 });
	}

	const { title } = await request.json();
	if (title) {
		await updateChatTitle(platform.env.DB, params.id, title);
	}

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!platform?.env?.DB) {
		return json({ error: 'Database not available' }, { status: 500 });
	}

	const chat = await getChatById(platform.env.DB, params.id);
	if (!chat || chat.user_id !== locals.user.id) {
		return json({ error: 'Chat not found' }, { status: 404 });
	}

	await deleteChat(platform.env.DB, params.id);

	return json({ success: true });
};
