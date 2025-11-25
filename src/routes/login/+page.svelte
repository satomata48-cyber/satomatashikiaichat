<script lang="ts">
	import { goto } from '$app/navigation';

	let email = '';
	let password = '';
	let error = '';
	let loading = false;

	async function handleSubmit() {
		error = '';
		loading = true;

		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.error || 'ログインに失敗しました';
				return;
			}

			goto('/chat');
		} catch (e) {
			error = 'ネットワークエラーが発生しました';
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen bg-dark-950 flex items-center justify-center px-4">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<a href="/" class="inline-flex items-center gap-2">
				<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
					<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
					</svg>
				</div>
				<span class="text-xl font-bold text-white">Satomata AI</span>
			</a>
		</div>

		<div class="card">
			<h1 class="text-2xl font-bold text-white mb-6 text-center">ログイン</h1>

			{#if error}
				<div class="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm">
					{error}
				</div>
			{/if}

			<form on:submit|preventDefault={handleSubmit} class="space-y-4">
				<div>
					<label for="email" class="block text-sm font-medium text-dark-300 mb-1">
						メールアドレス
					</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						required
						class="input-field"
						placeholder="you@example.com"
					/>
				</div>

				<div>
					<label for="password" class="block text-sm font-medium text-dark-300 mb-1">
						パスワード
					</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						required
						class="input-field"
						placeholder="••••••••"
					/>
				</div>

				<button type="submit" class="btn-primary w-full" disabled={loading}>
					{#if loading}
						<svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
					{/if}
					ログイン
				</button>
			</form>

			<p class="mt-6 text-center text-dark-400 text-sm">
				アカウントをお持ちでないですか？
				<a href="/register" class="text-primary-400 hover:text-primary-300">新規登録</a>
			</p>
		</div>
	</div>
</div>
