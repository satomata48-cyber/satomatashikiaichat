import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUsageHistory } from '$lib/server/db';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database not configured' }, { status: 500 });
	}

	const year = parseInt(url.searchParams.get('year') || new Date().getFullYear().toString());
	const month = parseInt(url.searchParams.get('month') || (new Date().getMonth() + 1).toString());

	try {
		const usage = await getUsageHistory(db, locals.user.id, year, month);

		return json({
			usage,
			year,
			month
		});
	} catch (error) {
		console.error('Usage history error:', error);
		return json({ error: 'Failed to get usage history' }, { status: 500 });
	}
};
