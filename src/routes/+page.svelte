<script lang="ts">
	// ランディングページ
</script>

<div class="min-h-screen bg-gradient-to-b from-dark-950 via-dark-900 to-dark-950">
	<!-- ヒーローセクション -->
	<header class="relative overflow-hidden">
		<!-- 背景エフェクト -->
		<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-900/20 via-dark-950 to-dark-950"></div>
		<div class="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary-500/10 rounded-full blur-3xl"></div>

		<nav class="relative z-10 container mx-auto px-6 py-6">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
						<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<span class="text-xl font-bold text-white">SatomatashikiAIchat</span>
				</div>
				<div class="flex items-center gap-4">
					<a href="/login" class="btn-ghost">ログイン</a>
					<a href="/register" class="btn-primary">無料で始める</a>
				</div>
			</div>
		</nav>

		<div class="relative z-10 container mx-auto px-6 pt-20 pb-32 text-center">
			<h1 class="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
				AI検索 × チャット<br>
				<span class="gradient-text">次世代の情報探索</span>
			</h1>
			<p class="text-xl text-dark-300 mb-10 max-w-2xl mx-auto">
				Perplexityのような検索力とChatGPTのような対話力を組み合わせた、
				あなただけのAIアシスタント
			</p>
			<div class="flex flex-col sm:flex-row items-center justify-center gap-4">
				<a href="/register" class="btn-primary text-lg px-8 py-3">
					無料で始める
					<svg class="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
					</svg>
				</a>
				<a href="#features" class="btn-secondary text-lg px-8 py-3">
					機能を見る
				</a>
			</div>
		</div>
	</header>

	<!-- 機能セクション -->
	<section id="features" class="py-24 bg-dark-900/50">
		<div class="container mx-auto px-6">
			<h2 class="text-3xl md:text-4xl font-bold text-white text-center mb-16">
				主な機能
			</h2>
			<div class="grid md:grid-cols-3 gap-8">
				<!-- 検索機能 -->
				<div class="card hover:border-primary-500/50 transition-colors group">
					<div class="w-14 h-14 rounded-xl bg-primary-500/10 flex items-center justify-center mb-6 group-hover:bg-primary-500/20 transition-colors">
						<svg class="w-7 h-7 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-white mb-3">AI検索</h3>
					<p class="text-dark-400">
						Webを検索し、最新情報をAIが要約。
						ソース付きで信頼性の高い回答を提供します。
					</p>
				</div>

				<!-- マルチLLM -->
				<div class="card hover:border-primary-500/50 transition-colors group">
					<div class="w-14 h-14 rounded-xl bg-primary-500/10 flex items-center justify-center mb-6 group-hover:bg-primary-500/20 transition-colors">
						<svg class="w-7 h-7 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-white mb-3">マルチLLM</h3>
					<p class="text-dark-400">
						Together AI、Ollama、LM Studioなど
						複数のAIモデルを自由に切り替え可能。
					</p>
				</div>

				<!-- プライバシー -->
				<div class="card hover:border-primary-500/50 transition-colors group">
					<div class="w-14 h-14 rounded-xl bg-primary-500/10 flex items-center justify-center mb-6 group-hover:bg-primary-500/20 transition-colors">
						<svg class="w-7 h-7 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-white mb-3">プライバシー</h3>
					<p class="text-dark-400">
						ローカルLLM対応でデータを外部に送信せず、
						完全にプライベートな環境で利用可能。
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA セクション -->
	<section class="py-24">
		<div class="container mx-auto px-6 text-center">
			<div class="card max-w-3xl mx-auto bg-gradient-to-br from-dark-900 to-dark-800 border-dark-700">
				<h2 class="text-3xl font-bold text-white mb-4">
					今すぐ始めましょう
				</h2>
				<p class="text-dark-300 mb-8">
					登録は無料です。メールアドレスとパスワードだけで始められます。
				</p>
				<a href="/register" class="btn-primary text-lg px-8 py-3">
					アカウントを作成
				</a>
			</div>
		</div>
	</section>

	<!-- フッター -->
	<footer class="border-t border-dark-800 py-8">
		<div class="container mx-auto px-6 text-center text-dark-500">
			<p>&copy; 2024 SatomatashikiAIchat. All rights reserved.</p>
		</div>
	</footer>
</div>
