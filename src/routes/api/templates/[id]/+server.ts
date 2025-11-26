import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPromptTemplateById, updatePromptTemplate, deletePromptTemplate } from '$lib/server/db';

// テンプレート取得
export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database not configured' }, { status: 500 });
	}

	try {
		const template = await getPromptTemplateById(db, params.id, locals.user.id);
		if (!template) {
			return json({ error: 'Template not found' }, { status: 404 });
		}
		return json({ template });
	} catch (error) {
		console.error('Get template error:', error);
		return json({ error: 'Failed to get template' }, { status: 500 });
	}
};

// テンプレート更新
export const PUT: RequestHandler = async ({ params, request, platform, locals }) => {
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
		await updatePromptTemplate(db, params.id, locals.user.id, name, content);
		return json({ success: true });
	} catch (error) {
		console.error('Update template error:', error);
		return json({ error: 'Failed to update template' }, { status: 500 });
	}
};

// テンプレート削除
export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database not configured' }, { status: 500 });
	}

	try {
		await deletePromptTemplate(db, params.id, locals.user.id);
		return json({ success: true });
	} catch (error) {
		console.error('Delete template error:', error);
		return json({ error: 'Failed to delete template' }, { status: 500 });
	}
};
