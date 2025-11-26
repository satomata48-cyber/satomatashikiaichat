import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// OpenRouter残高取得
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const provider = url.searchParams.get('provider');

	if (provider === 'openrouter') {
		const env = platform?.env as Record<string, string>;
		const apiKey = env?.OPENROUTER_API_KEY;

		if (!apiKey) {
			return json({ error: 'OpenRouter API key not configured' }, { status: 500 });
		}

		try {
			const response = await fetch('https://openrouter.ai/api/v1/credits', {
				headers: {
					'Authorization': `Bearer ${apiKey}`
				}
			});

			if (!response.ok) {
				return json({ error: 'Failed to fetch credits' }, { status: 500 });
			}

			const data = await response.json();
			// data.data.total_credits - data.data.total_usage = 残高
			const totalCredits = data.data?.total_credits || 0;
			const totalUsage = data.data?.total_usage || 0;
			const balance = totalCredits - totalUsage;

			return json({
				balance: balance.toFixed(4),
				provider: 'openrouter'
			});
		} catch (error) {
			console.error('OpenRouter credits error:', error);
			return json({ error: 'Failed to fetch credits' }, { status: 500 });
		}
	}

	return json({ error: 'Provider not supported for balance check' }, { status: 400 });
};
