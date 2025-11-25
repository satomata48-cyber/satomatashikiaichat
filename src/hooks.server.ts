import type { Handle } from '@sveltejs/kit';
import { getSessionByToken, getUserById } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get('session');

	if (sessionToken && event.platform?.env?.DB) {
		const session = await getSessionByToken(event.platform.env.DB, sessionToken);

		if (session) {
			const user = await getUserById(event.platform.env.DB, session.user_id);
			if (user) {
				event.locals.user = {
					id: user.id,
					email: user.email
				};
			}
		}
	}

	if (!event.locals.user) {
		event.locals.user = null;
	}

	return resolve(event);
};
