// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}

		interface Locals {
			user: {
				id: string;
				email: string;
			} | null;
		}

		interface PageData {}

		interface PageState {}

		interface Platform {
			env: {
				DB: D1Database;
				IMAGES: R2Bucket;
			};
			context: ExecutionContext;
			caches: CacheStorage;
		}
	}
}

export {};
