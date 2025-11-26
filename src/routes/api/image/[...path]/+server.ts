import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const r2 = platform?.env?.IMAGES;
	if (!r2) {
		throw error(500, 'R2 storage not configured');
	}

	const path = params.path;
	if (!path) {
		throw error(400, 'Path is required');
	}

	// セキュリティチェック：ユーザーは自分の画像のみアクセス可能
	if (!path.startsWith(locals.user.id + '/')) {
		throw error(403, 'Forbidden');
	}

	try {
		const object = await r2.get(path);
		if (!object) {
			throw error(404, 'Image not found');
		}

		const headers = new Headers();
		headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png');
		headers.set('Cache-Control', 'public, max-age=31536000');

		return new Response(object.body, { headers });
	} catch (err) {
		console.error('R2 get error:', err);
		throw error(500, 'Failed to retrieve image');
	}
};
