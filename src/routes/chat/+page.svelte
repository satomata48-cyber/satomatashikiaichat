<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	interface Message {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		reasoning?: string;
		sources?: { title: string; url: string; content: string }[];
	}

	interface Conversation {
		id: string;
		title: string;
		updated_at: string;
	}

	type Provider = 'together' | 'openrouter';

	interface ModelInfo {
		id: string;
		name: string;
		desc: string;
		icon: string;
		reasoning?: boolean;
		contextLength: string; // コンテキスト長
		inputCost: number; // $/1M tokens (入力)
		outputCost: number; // $/1M tokens (出力)
	}

	let conversations: Conversation[] = [];
	let currentConversationId: string | null = null;
	let messages: Message[] = [];
	let inputMessage = '';
	let loading = false;
	let loadingConversation = false;
	let enableSearch = true;
	let sidebarOpen = true;
	let streamingContent = '';
	let streamingReasoning = '';
	let selectedProvider: Provider = 'together';
	let selectedModel = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
	let showModelSelector = false;
	let expandedReasoning: Set<string> = new Set();

	const togetherModels: ModelInfo[] = [
		{ id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B', desc: '高性能・推奨', icon: '🦙', contextLength: '128K', inputCost: 0.88, outputCost: 0.88 },
		{ id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B', desc: '高速・軽量', icon: '🦙', contextLength: '128K', inputCost: 0.18, outputCost: 0.18 },
		{ id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B', desc: '高性能', icon: '🦙', contextLength: '128K', inputCost: 0.88, outputCost: 0.88 },
		{ id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B', desc: '最高性能', icon: '🦙', contextLength: '128K', inputCost: 3.50, outputCost: 3.50 },
		{ id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', desc: 'バランス型', icon: '🌀', contextLength: '32K', inputCost: 0.60, outputCost: 0.60 },
		{ id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B', name: 'DeepSeek R1 70B', desc: '推論特化', icon: '🧠', reasoning: true, contextLength: '128K', inputCost: 0.75, outputCost: 0.99 },
		{ id: 'moonshotai/Kimi-K2-Instruct', name: 'Kimi K2', desc: '推論特化', icon: '🌙', reasoning: true, contextLength: '128K', inputCost: 0.60, outputCost: 0.89 },
	];

	const openrouterModels: ModelInfo[] = [
		{ id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', desc: '高速・高性能', icon: '✨', contextLength: '1M', inputCost: 0.15, outputCost: 0.60 },
		{ id: 'x-ai/grok-3-beta', name: 'Grok 3', desc: 'xAI最新', icon: '🚀', contextLength: '128K', inputCost: 3.00, outputCost: 15.00 },
		{ id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', desc: 'Anthropic最新', icon: '🎭', contextLength: '200K', inputCost: 3.00, outputCost: 15.00 },
		{ id: 'openai/gpt-4o', name: 'GPT-4o', desc: 'OpenAI', icon: '🤖', contextLength: '128K', inputCost: 2.50, outputCost: 10.00 },
		{ id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', desc: 'Meta AI', icon: '🦙', contextLength: '128K', inputCost: 0.12, outputCost: 0.30 },
		{ id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', desc: '推論特化', icon: '🧠', reasoning: true, contextLength: '64K', inputCost: 0.55, outputCost: 2.19 },
		{ id: 'moonshotai/kimi-k2', name: 'Kimi K2', desc: '推論特化', icon: '🌙', reasoning: true, contextLength: '128K', inputCost: 0.60, outputCost: 0.89 },
	];

	function toggleReasoning(messageId: string) {
		if (expandedReasoning.has(messageId)) {
			expandedReasoning.delete(messageId);
		} else {
			expandedReasoning.add(messageId);
		}
		expandedReasoning = expandedReasoning;
	}

	function isReasoningModel(): boolean {
		const model = getSelectedModel();
		return model.reasoning === true;
	}

	function getModels(): ModelInfo[] {
		return selectedProvider === 'together' ? togetherModels : openrouterModels;
	}

	function getSelectedModel(): ModelInfo {
		const models = getModels();
		return models.find(m => m.id === selectedModel) || models[0];
	}

	// 1日あたりの会話回数を計算（$5/月予算）
	// 平均1会話あたり: 入力1000トークン + 出力500トークン と想定
	function calcDailyConversations(model: ModelInfo): number {
		const monthlyBudget = 5; // $5/月
		const dailyBudget = monthlyBudget / 30;
		const avgInputTokens = 1000;
		const avgOutputTokens = 500;
		const costPerConversation = (model.inputCost * avgInputTokens / 1_000_000) + (model.outputCost * avgOutputTokens / 1_000_000);
		return Math.floor(dailyBudget / costPerConversation);
	}

	function selectProvider(provider: Provider) {
		selectedProvider = provider;
		// Reset to first model of new provider
		const models = provider === 'together' ? togetherModels : openrouterModels;
		selectedModel = models[0].id;
		showModelSelector = false;
	}

	function selectModel(modelId: string) {
		selectedModel = modelId;
		showModelSelector = false;
	}

	onMount(async () => {
		await loadConversations();
	});

	async function loadConversations() {
		try {
			const res = await fetch('/api/conversations');
			if (res.status === 401) {
				goto('/login');
				return;
			}
			const data = await res.json();
			conversations = data.conversations || [];
		} catch (e) {
			console.error('Failed to load conversations:', e);
		}
	}

	async function loadConversation(id: string) {
		if (loadingConversation || currentConversationId === id) return;

		loadingConversation = true;
		currentConversationId = id;
		messages = [];

		try {
			const res = await fetch(`/api/conversations/${id}`);
			if (!res.ok) {
				currentConversationId = null;
				return;
			}
			const data = await res.json();
			messages = data.messages.map((m: any) => ({
				id: m.id,
				role: m.role,
				content: m.content,
				sources: m.sources ? JSON.parse(m.sources) : undefined
			}));
		} catch (e) {
			console.error('Failed to load conversation:', e);
			currentConversationId = null;
		} finally {
			loadingConversation = false;
		}
	}

	function newChat() {
		currentConversationId = null;
		messages = [];
		inputMessage = '';
	}

	async function sendMessage() {
		if (!inputMessage.trim() || loading) return;

		const userMessage = inputMessage.trim();
		inputMessage = '';
		loading = true;
		streamingContent = '';
		streamingReasoning = '';

		// Add user message to UI
		messages = [...messages, {
			id: crypto.randomUUID(),
			role: 'user',
			content: userMessage
		}];

		let sources: any[] = [];
		let fullContent = '';
		let fullReasoning = '';

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: userMessage,
					conversationId: currentConversationId,
					enableSearch,
					model: selectedModel,
					provider: selectedProvider
				})
			});

			if (res.status === 401) {
				goto('/login');
				return;
			}

			if (!res.ok) {
				let errorMsg = 'Failed to send message';
				try {
					const error = await res.json();
					errorMsg = error.error || errorMsg;
				} catch {}
				throw new Error(errorMsg);
			}

			const reader = res.body?.getReader();
			if (!reader) throw new Error('No response body');

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						try {
							const data = JSON.parse(line.slice(6));

							if (data.conversationId && !currentConversationId) {
								currentConversationId = data.conversationId;
							}

							if (data.sources) {
								sources = data.sources;
							}

							if (data.reasoning) {
								fullReasoning += data.reasoning;
								streamingReasoning = fullReasoning;
							}

							if (data.content) {
								fullContent += data.content;
								streamingContent = fullContent;
							}

							if (data.error) {
								fullContent = `エラー: ${data.error}`;
								streamingContent = fullContent;
							}

							if (data.done) {
								// Add final message
								const newMessageId = crypto.randomUUID();
								messages = [...messages, {
									id: newMessageId,
									role: 'assistant',
									content: fullContent || 'エラー: 応答がありませんでした',
									reasoning: fullReasoning || undefined,
									sources: sources.length > 0 ? sources : undefined
								}];
								// Auto expand reasoning if exists
								if (fullReasoning) {
									expandedReasoning.add(newMessageId);
									expandedReasoning = expandedReasoning;
								}
								streamingContent = '';
								streamingReasoning = '';
								loading = false;
								await loadConversations();
								return;
							}
						} catch (e) {
							// Skip invalid JSON
							console.log('Parse error:', e, line);
						}
					}
				}
			}

			// If stream ended without done signal, still add the message
			if (fullContent) {
				const newMessageId = crypto.randomUUID();
				messages = [...messages, {
					id: newMessageId,
					role: 'assistant',
					content: fullContent,
					reasoning: fullReasoning || undefined,
					sources: sources.length > 0 ? sources : undefined
				}];
				if (fullReasoning) {
					expandedReasoning.add(newMessageId);
					expandedReasoning = expandedReasoning;
				}
				streamingContent = '';
				streamingReasoning = '';
				await loadConversations();
			}
		} catch (e) {
			console.error('Chat error:', e);
			// Add error message or the partial content if any
			const errorContent = fullContent || `エラーが発生しました: ${e instanceof Error ? e.message : 'Unknown error'}`;
			messages = [...messages, {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: errorContent
			}];
			streamingContent = '';
		} finally {
			loading = false;
		}
	}

	async function deleteConversation(id: string) {
		if (!confirm('この会話を削除しますか？')) return;

		try {
			await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
			conversations = conversations.filter(c => c.id !== id);
			if (currentConversationId === id) {
				newChat();
			}
		} catch (e) {
			console.error('Failed to delete conversation:', e);
		}
	}

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		goto('/');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}
</script>

<div class="h-screen flex bg-dark-950">
	<!-- Sidebar -->
	<div class="w-64 bg-dark-900 border-r border-dark-800 flex flex-col {sidebarOpen ? '' : 'hidden'} md:flex">
		<div class="p-4 border-b border-dark-800">
			<button on:click={newChat} class="btn-primary w-full flex items-center justify-center gap-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				新しいチャット
			</button>
		</div>

		<div class="flex-1 overflow-y-auto p-2">
			{#each conversations as conv}
				<div class="group flex items-center gap-2 p-2 rounded-lg hover:bg-dark-800 cursor-pointer {currentConversationId === conv.id ? 'bg-dark-800' : ''}">
					<button
						on:click={() => loadConversation(conv.id)}
						class="flex-1 text-left text-sm text-dark-300 truncate"
					>
						{conv.title}
					</button>
					<button
						on:click|stopPropagation={() => deleteConversation(conv.id)}
						class="opacity-0 group-hover:opacity-100 p-1 text-dark-500 hover:text-red-400"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
				</div>
			{/each}
		</div>

		<div class="p-4 border-t border-dark-800">
			<button on:click={logout} class="btn-ghost w-full text-sm">
				ログアウト
			</button>
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex-1 flex flex-col">
		<!-- Header -->
		<header class="h-14 border-b border-dark-800 flex items-center px-4 gap-4">
			<button on:click={() => sidebarOpen = !sidebarOpen} class="md:hidden text-dark-400">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<div class="flex items-center gap-2">
				<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
					<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
					</svg>
				</div>
				<span class="font-semibold text-white">SatomatashikiAIchat</span>
			</div>
			<div class="flex-1"></div>
		</header>

		<!-- Messages -->
		<div class="flex-1 overflow-y-auto p-4">
			{#if loadingConversation}
				<div class="h-full flex flex-col items-center justify-center text-center">
					<div class="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mb-4"></div>
					<p class="text-dark-400">読み込み中...</p>
				</div>
			{:else if messages.length === 0 && !streamingContent && !streamingReasoning}
				<div class="h-full flex flex-col items-center justify-center text-center">
					<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mb-4">
						<svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<h2 class="text-2xl font-bold text-white mb-2">SatomatashikiAIchat</h2>
					<p class="text-dark-400 max-w-md">
						質問を入力してください。Web検索を有効にすると、最新情報を元に回答します。
					</p>
				</div>
			{:else}
				<div class="max-w-3xl mx-auto space-y-6">
					{#each messages as message}
						<div class="flex gap-4 {message.role === 'user' ? 'flex-row-reverse' : ''}">
							<div class="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center {message.role === 'user' ? 'bg-primary-600' : 'bg-dark-700'}">
								{#if message.role === 'user'}
									<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
									</svg>
								{:else}
									<svg class="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
									</svg>
								{/if}
							</div>
							<div class="flex-1 {message.role === 'user' ? 'text-right' : ''}">
								{#if message.reasoning}
									<div class="mb-2">
										<button
											on:click={() => toggleReasoning(message.id)}
											class="flex items-center gap-2 text-xs text-dark-400 hover:text-dark-300 transition-colors"
										>
											<span class="text-base">🧠</span>
											思考過程
											<svg class="w-3 h-3 transition-transform {expandedReasoning.has(message.id) ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
											</svg>
										</button>
										{#if expandedReasoning.has(message.id)}
											<div class="mt-2 p-3 bg-dark-900 border border-dark-700 rounded-xl text-xs text-dark-400 whitespace-pre-wrap max-h-64 overflow-y-auto">
												{message.reasoning}
											</div>
										{/if}
									</div>
								{/if}
								<div class="inline-block text-left rounded-2xl px-4 py-3 {message.role === 'user' ? 'bg-primary-600 text-white' : 'bg-dark-800 text-dark-200'}">
									<p class="whitespace-pre-wrap">{message.content}</p>
								</div>
								{#if message.sources && message.sources.length > 0}
									<div class="mt-2 space-y-1">
										<p class="text-xs text-dark-500">参考ソース:</p>
										{#each message.sources as source}
											<a href={source.url} target="_blank" rel="noopener" class="block text-xs text-primary-400 hover:underline truncate">
												{source.title}
											</a>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/each}

					{#if streamingReasoning || streamingContent}
						<div class="flex gap-4">
							<div class="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-dark-700">
								<svg class="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
								</svg>
							</div>
							<div class="flex-1">
								{#if streamingReasoning}
									<div class="mb-2">
										<div class="flex items-center gap-2 text-xs text-dark-400 mb-2">
											<span class="text-base">🧠</span>
											思考中...
										</div>
										<div class="p-3 bg-dark-900 border border-dark-700 rounded-xl text-xs text-dark-400 whitespace-pre-wrap max-h-64 overflow-y-auto">
											{streamingReasoning}<span class="animate-pulse">▌</span>
										</div>
									</div>
								{/if}
								{#if streamingContent}
									<div class="inline-block text-left rounded-2xl px-4 py-3 bg-dark-800 text-dark-200">
										<p class="whitespace-pre-wrap">{streamingContent}<span class="animate-pulse">▌</span></p>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					{#if loading && !streamingContent}
						<div class="flex gap-4">
							<div class="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-dark-700">
								<svg class="w-5 h-5 text-primary-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
								</svg>
							</div>
							<div class="flex-1">
								<div class="inline-block rounded-2xl px-4 py-3 bg-dark-800">
									<div class="flex gap-1">
										<span class="w-2 h-2 bg-dark-500 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
										<span class="w-2 h-2 bg-dark-500 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
										<span class="w-2 h-2 bg-dark-500 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Input -->
		<div class="border-t border-dark-800 p-4">
			<div class="max-w-3xl mx-auto">
				<!-- Options Bar -->
				<div class="flex items-center gap-2 mb-3 flex-wrap">
					<!-- Provider Selector -->
					<div class="flex items-center gap-1 p-1 bg-dark-800 rounded-lg">
						<button
							on:click={() => selectProvider('together')}
							class="px-3 py-1 rounded-md text-sm transition-colors {selectedProvider === 'together' ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-dark-200'}"
						>
							Together
						</button>
						<button
							on:click={() => selectProvider('openrouter')}
							class="px-3 py-1 rounded-md text-sm transition-colors {selectedProvider === 'openrouter' ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-dark-200'}"
						>
							OpenRouter
						</button>
					</div>

					<!-- Model Selector Button -->
					<div class="relative">
						<button
							on:click={() => showModelSelector = !showModelSelector}
							class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors bg-dark-800 border-dark-700 text-dark-300 hover:bg-dark-700 hover:text-dark-200"
						>
							<span class="text-base">{getSelectedModel().icon}</span>
							{getSelectedModel().name}
							<span class="px-1.5 py-0.5 text-xs bg-blue-600/30 text-blue-400 rounded">{getSelectedModel().contextLength}</span>
							{#if getSelectedModel().reasoning}
								<span class="px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-400 rounded">推論</span>
							{/if}
						</button>

						{#if showModelSelector}
							<div class="absolute bottom-full left-0 mb-2 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-10 p-3 min-w-[340px]">
								<p class="text-xs text-dark-500 px-2 py-1 mb-2">モデルを選択</p>
								<div class="space-y-1.5">
									{#each getModels() as model}
										<button
											on:click={() => selectModel(model.id)}
											class="group/model flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors {selectedModel === model.id ? 'bg-primary-600/20 border border-primary-500/50 text-primary-400' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}"
										>
											<span class="text-base">{model.icon}</span>
											<span class="flex-1 text-left">{model.name}</span>
											<span class="px-1.5 py-0.5 text-xs bg-blue-600/30 text-blue-400 rounded">{model.contextLength}</span>
											{#if model.reasoning}
												<span class="px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-400 rounded">推論</span>
											{/if}
											<span class="text-xs text-dark-500 opacity-0 group-hover/model:opacity-100 transition-opacity">約{calcDailyConversations(model)}回/日</span>
										</button>
									{/each}
								</div>
								<p class="text-xs text-dark-600 mt-2 px-2">※ホバーで$5/月予算の目安表示</p>
							</div>
						{/if}
					</div>

					<!-- Web Search Toggle -->
					<button
						on:click={() => enableSearch = !enableSearch}
						class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors {enableSearch ? 'bg-primary-600/20 border-primary-500/50 text-primary-400' : 'bg-dark-800 border-dark-700 text-dark-400 hover:bg-dark-700'}"
					>
						<span class="text-base">🔍</span>
						Web検索
						{#if enableSearch}
							<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
						{/if}
					</button>
				</div>

				<!-- Input Field -->
				<div class="flex gap-2">
					<textarea
						bind:value={inputMessage}
						on:keydown={handleKeydown}
						placeholder="メッセージを入力..."
						rows="1"
						class="input-field flex-1 resize-none"
						disabled={loading}
					></textarea>
					<button
						on:click={sendMessage}
						disabled={loading || !inputMessage.trim()}
						class="btn-primary px-4"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Click outside to close model selector -->
{#if showModelSelector}
	<button
		class="fixed inset-0 z-0"
		on:click={() => showModelSelector = false}
		aria-label="Close model selector"
	></button>
{/if}
