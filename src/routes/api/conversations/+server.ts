import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChatsByUser } from '$lib/server/db';

export const GET: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!platform?.env?.DB) {
		return json({ error: 'Database not available' }, { status: 500 });
	}

	const chats = await getChatsByUser(platform.env.DB, locals.user.id);
	return json({ conversations: chats });
};
