import type { RequestHandler } from './$types';
import { getModelUsageStats, getSearchUsage } from '$lib/server/db';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!platform?.env?.DB) {
		return new Response(JSON.stringify({ error: 'Database not available' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const year = parseInt(url.searchParams.get('year') || new Date().getFullYear().toString());
	const month = parseInt(url.searchParams.get('month') || (new Date().getMonth() + 1).toString());

	try {
		const [stats, searchUsage] = await Promise.all([
			getModelUsageStats(platform.env.DB, locals.user.id, year, month),
			getSearchUsage(platform.env.DB, locals.user.id)
		]);
		return new Response(JSON.stringify({ stats, searchUsage }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Stats error:', error);
		return new Response(JSON.stringify({ error: 'Failed to get stats' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
