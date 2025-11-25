import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteSession } from '$lib/server/db';

export const POST: RequestHandler = async ({ platform, cookies }) => {
	const sessionToken = cookies.get('session');

	if (sessionToken && platform?.env?.DB) {
		await deleteSession(platform.env.DB, sessionToken);
	}

	cookies.delete('session', { path: '/' });

	return json({ success: true });
};
