import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPromptTemplates, createPromptTemplate } from '$lib/server/db';

// テンプレート一覧取得
export const GET: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database not configured' }, { status: 500 });
	}

	try {
		const templates = await getPromptTemplates(db, locals.user.id);
		return json({ templates });
	} catch (error) {
		console.error('Get templates error:', error);
		return json({ error: 'Failed to get templates' }, { status: 500 });
	}
};

// テンプレート作成
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database not configured' }, { status: 500 });
	}

	const { name, content } = await request.json();

	if (!name || !content) {
		return json({ error: 'Name and content are required' }, { status: 400 });
	}

	try {
		const template = await createPromptTemplate(db, locals.user.id, name, content);
		return json({ template });
	} catch (error) {
		console.error('Create template error:', error);
		return json({ error: 'Failed to create template' }, { status: 500 });
	}
};
