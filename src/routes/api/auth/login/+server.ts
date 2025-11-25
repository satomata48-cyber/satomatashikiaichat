import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPassword, generateSessionToken } from '$lib/server/auth';
import { getUserByEmail, createSession } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	if (!platform?.env?.DB) {
		return json({ error: 'Database not available' }, { status: 500 });
	}

	const { email, password } = await request.json();

	if (!email || !password) {
		return json({ error: 'メールアドレスとパスワードを入力してください' }, { status: 400 });
	}

	// Find user
	const user = await getUserByEmail(platform.env.DB, email);
	if (!user) {
		return json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 });
	}

	// Verify password
	if (!verifyPassword(password, user.password_hash)) {
		return json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 });
	}

	// Create session
	const sessionToken = generateSessionToken();
	const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
	await createSession(platform.env.DB, user.id, sessionToken, expiresAt);

	// Set cookie
	cookies.set('session', sessionToken, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		expires: expiresAt
	});

	return json({ success: true, user: { id: user.id, email: user.email } });
};
