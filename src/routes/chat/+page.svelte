<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	interface Message {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		reasoning?: string;
		sources?: { title: string; url: string; content: string }[];
		image?: string; // 画像生成結果（base64 data URL）
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
		longContext?: boolean; // 前の会話を参照可能（長いコンテキスト）
		contextLength: string; // コンテキスト長
		inputCost: number; // $/1M tokens (入力)
		outputCost: number; // $/1M tokens (出力)
	}

	let conversations: Conversation[] = [];
	let currentConversationId: string | null = null;
	let messages: Message[] = [];
	let inputMessage = '';
	let textareaRef: HTMLTextAreaElement;
	let loading = false;
	let loadingConversation = false;
	let enableSearch = false;
	let enableImageGen = false; // 画像生成モード
	let sidebarOpen = false; // スマホではデフォルトで閉じる
	let streamingContent = '';
	let streamingReasoning = '';
	let selectedProvider: Provider = 'together';
	let selectedModel = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
	let showModelSelector = false;
	let expandedReasoning: Set<string> = new Set();

	const togetherModels: ModelInfo[] = [
		// 高速チャット
		{ id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B', desc: '高速・賢い', icon: '🦙', longContext: true, contextLength: '128K', inputCost: 0.88, outputCost: 0.88 },
		// 推論特化
		{ id: 'moonshotai/Kimi-K2-Instruct', name: 'Kimi K2', desc: '推論', icon: '🌙', reasoning: true, longContext: true, contextLength: '128K', inputCost: 1.20, outputCost: 4.00 },
		{ id: 'deepseek-ai/DeepSeek-R1-0528-tput', name: 'DeepSeek R1', desc: '推論・格安', icon: '🧠', reasoning: true, longContext: true, contextLength: '128K', inputCost: 0.55, outputCost: 2.19 },
	];

	const openrouterModels: ModelInfo[] = [
		{ id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', desc: '高速・高性能', icon: '✨', longContext: true, contextLength: '1M', inputCost: 0.15, outputCost: 0.60 },
		{ id: 'x-ai/grok-3-beta', name: 'Grok 3', desc: 'xAI最新', icon: '🚀', longContext: true, contextLength: '128K', inputCost: 3.00, outputCost: 15.00 },
		{ id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', desc: 'Anthropic最新', icon: '🎭', longContext: true, contextLength: '200K', inputCost: 3.00, outputCost: 15.00 },
		{ id: 'openai/gpt-4o', name: 'GPT-4o', desc: 'OpenAI', icon: '🤖', longContext: true, contextLength: '128K', inputCost: 2.50, outputCost: 10.00 },
		{ id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', desc: 'Meta AI', icon: '🦙', longContext: true, contextLength: '128K', inputCost: 0.12, outputCost: 0.30 },
		{ id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', desc: '推論特化', icon: '🧠', reasoning: true, contextLength: '64K', inputCost: 0.55, outputCost: 2.19 },
		{ id: 'moonshotai/kimi-k2', name: 'Kimi K2', desc: '推論特化', icon: '🌙', reasoning: true, longContext: true, contextLength: '128K', inputCost: 0.60, outputCost: 0.89 },
	];

	// 画像生成モデル
	interface ImageModelInfo {
		id: string;
		name: string;
		desc: string;
		cost: string; // 1枚あたりの料金
	}

	const imageModels: ImageModelInfo[] = [
		{ id: 'black-forest-labs/FLUX.1-schnell-Free', name: 'FLUX.1 schnell', desc: '高速・無料', cost: '無料' },
		{ id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 schnell Pro', desc: '高速・高品質', cost: '$0.003' },
		{ id: 'black-forest-labs/FLUX.1-dev', name: 'FLUX.1 dev', desc: '開発版', cost: '$0.025' },
		{ id: 'black-forest-labs/FLUX.1-pro', name: 'FLUX.1 pro', desc: '最高品質', cost: '$0.05' },
		{ id: 'black-forest-labs/FLUX.1.1-pro', name: 'FLUX 1.1 pro', desc: '最新・最高品質', cost: '$0.04' },
	];

	let selectedImageModel = 'black-forest-labs/FLUX.1-schnell-Free';
	let showImageModelSelector = false;
	let imageWarning: string | null = null;
	let showSettings = false;
	let showHistory = false;
	let usageHistory: { date: string; count: number }[] = [];

	// テンプレート関連
	interface PromptTemplate {
		id: string;
		name: string;
		content: string;
	}
	let templates: PromptTemplate[] = [];
	let selectedTemplateId: string | null = null;
	let showTemplateSelector = false;
	let showTemplateEditor = false;
	let editingTemplate: PromptTemplate | null = null;
	let newTemplateName = '';
	let newTemplateContent = '';
	let loadingHistory = false;
	let currentMonth = new Date();

	// 残高表示
	let providerBalance: string | null = null;
	let loadingBalance = false;

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

	// 1日あたりの会話回数を計算（1000円/月予算）
	// 平均1会話あたり: 入力1000トークン + 出力500トークン と想定
	function calcDailyConversations(model: ModelInfo): string {
		// 無料モデルの場合
		if (model.inputCost === 0 && model.outputCost === 0) {
			return '無料';
		}
		const monthlyBudgetYen = 1000; // 1000円/月
		const exchangeRate = 150; // 1ドル = 150円
		const monthlyBudgetUsd = monthlyBudgetYen / exchangeRate; // 約$6.67
		const dailyBudget = monthlyBudgetUsd / 30;
		const avgInputTokens = 1000;
		const avgOutputTokens = 500;
		const costPerConversation = (model.inputCost * avgInputTokens / 1_000_000) + (model.outputCost * avgOutputTokens / 1_000_000);
		return `約${Math.floor(dailyBudget / costPerConversation)}回/日`;
	}

	function selectProvider(provider: Provider) {
		selectedProvider = provider;
		// Reset to first model of new provider
		const models = provider === 'together' ? togetherModels : openrouterModels;
		selectedModel = models[0].id;
		showModelSelector = false;
		// 残高を取得
		loadProviderBalance(provider);
	}

	async function loadProviderBalance(provider: Provider) {
		providerBalance = null;
		if (provider === 'openrouter') {
			loadingBalance = true;
			try {
				const res = await fetch(`/api/credits?provider=openrouter`);
				if (res.ok) {
					const data = await res.json();
					providerBalance = `$${data.balance}`;
				}
			} catch (e) {
				console.error('Failed to load balance:', e);
			} finally {
				loadingBalance = false;
			}
		}
	}

	function selectModel(modelId: string) {
		selectedModel = modelId;
		showModelSelector = false;
	}

	onMount(async () => {
		// PC画面サイズ（768px以上）ではサイドバーを開く
		if (window.innerWidth >= 768) {
			sidebarOpen = true;
		}
		await loadConversations();
		await loadTemplates();
		// 初期プロバイダーの残高を取得
		loadProviderBalance(selectedProvider);
	});

	// テンプレート関連の関数
	async function loadTemplates() {
		try {
			const res = await fetch('/api/templates');
			if (res.ok) {
				const data = await res.json();
				templates = data.templates || [];
			}
		} catch (e) {
			console.error('Failed to load templates:', e);
		}
	}

	async function createTemplate() {
		if (!newTemplateName.trim() || !newTemplateContent.trim()) return;
		try {
			const res = await fetch('/api/templates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newTemplateName, content: newTemplateContent })
			});
			if (res.ok) {
				await loadTemplates();
				newTemplateName = '';
				newTemplateContent = '';
				showTemplateEditor = false;
			}
		} catch (e) {
			console.error('Failed to create template:', e);
		}
	}

	async function updateTemplate() {
		if (!editingTemplate || !newTemplateName.trim() || !newTemplateContent.trim()) return;
		try {
			const res = await fetch(`/api/templates/${editingTemplate.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newTemplateName, content: newTemplateContent })
			});
			if (res.ok) {
				await loadTemplates();
				editingTemplate = null;
				newTemplateName = '';
				newTemplateContent = '';
				showTemplateEditor = false;
			}
		} catch (e) {
			console.error('Failed to update template:', e);
		}
	}

	async function deleteTemplate(id: string) {
		if (!confirm('このテンプレートを削除しますか？')) return;
		try {
			const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
			if (res.ok) {
				await loadTemplates();
				if (selectedTemplateId === id) {
					selectedTemplateId = null;
				}
			}
		} catch (e) {
			console.error('Failed to delete template:', e);
		}
	}

	function openTemplateEditor(template?: PromptTemplate) {
		if (template) {
			editingTemplate = template;
			newTemplateName = template.name;
			newTemplateContent = template.content;
		} else {
			editingTemplate = null;
			newTemplateName = '';
			newTemplateContent = '';
		}
		showTemplateEditor = true;
	}

	function getSelectedTemplate(): PromptTemplate | null {
		return templates.find(t => t.id === selectedTemplateId) || null;
	}

	async function loadUsageHistory() {
		loadingHistory = true;
		try {
			const year = currentMonth.getFullYear();
			const month = currentMonth.getMonth() + 1;
			const res = await fetch(`/api/usage?year=${year}&month=${month}`);
			if (res.ok) {
				const data = await res.json();
				usageHistory = data.usage || [];
			}
		} catch (e) {
			console.error('Failed to load usage history:', e);
		} finally {
			loadingHistory = false;
		}
	}

	function openHistory() {
		showHistory = true;
		loadUsageHistory();
	}

	function changeMonth(delta: number) {
		currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
		loadUsageHistory();
	}

	function getUsageForDay(day: number): number {
		const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		const found = usageHistory.find(u => u.date === dateStr);
		return found?.count || 0;
	}

	function getDaysInMonth(): number {
		return new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
	}

	function getFirstDayOfMonth(): number {
		return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
	}

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
			messages = data.messages.map((m: any) => {
				// Markdown形式の画像URLを抽出
				const imageMatch = m.content.match(/!\[.*?\]\((\/api\/image\/[^\)]+)\)/);
				const imageUrl = imageMatch ? imageMatch[1] : undefined;
				// 画像URLを含む場合はcontentから画像部分を取り除く
				let content = m.content;
				if (imageUrl) {
					content = content.replace(/!\[.*?\]\(\/api\/image\/[^\)]+\)\n*/, '').trim();
				}
				return {
					id: m.id,
					role: m.role,
					content: content || '画像を生成しました',
					image: imageUrl,
					sources: m.sources ? JSON.parse(m.sources) : undefined
				};
			});
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
		resetTextarea();
		loading = true;
		streamingContent = '';
		streamingReasoning = '';

		// Add user message to UI
		messages = [...messages, {
			id: crypto.randomUUID(),
			role: 'user',
			content: userMessage
		}];

		// 画像生成モードの場合
		if (enableImageGen) {
			try {
				const res = await fetch('/api/image', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						prompt: userMessage,
						model: selectedImageModel,
						provider: selectedProvider,
						conversationId: currentConversationId
					})
				});

				if (res.status === 401) {
					goto('/login');
					return;
				}

				if (!res.ok) {
					const error = await res.json();
					throw new Error(error.error || 'Image generation failed');
				}

				const data = await res.json();

				// 会話IDを更新
				if (data.conversationId && !currentConversationId) {
					currentConversationId = data.conversationId;
				}

				// 警告メッセージを表示
				if (data.warning) {
					imageWarning = data.warning;
				}

				messages = [...messages, {
					id: crypto.randomUUID(),
					role: 'assistant',
					content: `画像を生成しました (${data.model})`,
					image: data.image
				}];

				// 会話一覧を更新
				await loadConversations();
			} catch (e) {
				console.error('Image generation error:', e);
				messages = [...messages, {
					id: crypto.randomUUID(),
					role: 'assistant',
					content: `画像生成エラー: ${e instanceof Error ? e.message : 'Unknown error'}`
				}];
			} finally {
				loading = false;
			}
			return;
		}

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
					provider: selectedProvider,
					systemPrompt: getSelectedTemplate()?.content || null
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

	// テキストエリア自動リサイズ
	function autoResizeTextarea() {
		if (textareaRef) {
			textareaRef.style.height = 'auto';
			textareaRef.style.height = Math.min(textareaRef.scrollHeight, 200) + 'px';
		}
	}

	// メッセージ送信後にリセット
	function resetTextarea() {
		if (textareaRef) {
			textareaRef.style.height = 'auto';
		}
	}
</script>

<div class="h-screen flex bg-dark-950 overflow-hidden">
	<!-- Mobile Sidebar Overlay -->
	{#if sidebarOpen}
		<button
			class="fixed inset-0 bg-black/50 z-40 md:hidden"
			on:click={() => sidebarOpen = false}
			aria-label="Close sidebar"
		></button>
	{/if}

	<!-- Sidebar -->
	<div class="fixed md:relative w-64 h-full bg-dark-900 border-r border-dark-800 flex flex-col z-50 transition-transform duration-300 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0">
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

		<div class="p-4 border-t border-dark-800 space-y-2">
			<button on:click={openHistory} class="btn-ghost w-full text-sm flex items-center justify-center gap-2">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
				</svg>
				履歴
			</button>
			<button on:click={() => showSettings = true} class="btn-ghost w-full text-sm flex items-center justify-center gap-2">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
				設定
			</button>
			<button on:click={logout} class="btn-ghost w-full text-sm">
				ログアウト
			</button>
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex-1 flex flex-col">
		<!-- Header -->
		<header class="h-14 border-b border-dark-800 flex items-center px-4 gap-4">
			<button on:click={() => sidebarOpen = !sidebarOpen} class="md:hidden text-dark-400" aria-label="Toggle sidebar">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<button on:click={newChat} class="flex items-center gap-2 hover:opacity-80 transition-opacity">
				<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
					<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
					</svg>
				</div>
				<span class="font-semibold text-white hidden sm:inline">SatomatashikiAIchat</span>
			</button>

			<!-- Provider Selector in Header -->
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

			<!-- Balance Display -->
			<div class="text-xs text-dark-400 hidden sm:block">
				{#if selectedProvider === 'openrouter'}
					{#if loadingBalance}
						<span class="text-dark-500">読込中...</span>
					{:else if providerBalance !== null}
						<span class="text-green-400">${providerBalance}</span>
					{/if}
				{:else}
					<a
						href="https://api.together.xyz/settings/billing"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary-400 hover:text-primary-300 underline"
					>
						残高確認
					</a>
				{/if}
			</div>

			<div class="flex-1"></div>
		</header>

		<!-- Messages -->
		<div class="flex-1 overflow-y-auto overflow-x-hidden p-4">
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
				<div class="max-w-3xl mx-auto space-y-6 overflow-hidden">
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
							<div class="flex-1 min-w-0 {message.role === 'user' ? 'text-right' : ''}">
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
								<div class="inline-block text-left rounded-2xl px-4 py-3 max-w-full {message.role === 'user' ? 'bg-primary-600 text-white' : 'bg-dark-800 text-dark-200'}">
									<p class="whitespace-pre-wrap break-words overflow-wrap-anywhere">{message.content}</p>
								</div>
								{#if message.image}
									<div class="mt-2">
										<img src={message.image} alt="Generated image" class="max-w-md rounded-xl border border-dark-700 shadow-lg" />
										<a href={message.image} download="generated-image.png" class="inline-block mt-2 text-xs text-primary-400 hover:underline">
											画像をダウンロード
										</a>
									</div>
								{/if}
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
							<div class="flex-1 min-w-0">
								{#if streamingReasoning}
									<div class="mb-2">
										<div class="flex items-center gap-2 text-xs text-dark-400 mb-2">
											<span class="text-base">🧠</span>
											思考中...
										</div>
										<div class="p-3 bg-dark-900 border border-dark-700 rounded-xl text-xs text-dark-400 whitespace-pre-wrap max-h-64 overflow-y-auto break-words">
											{streamingReasoning}<span class="animate-pulse">▌</span>
										</div>
									</div>
								{/if}
								{#if streamingContent}
									<div class="inline-block text-left rounded-2xl px-4 py-3 bg-dark-800 text-dark-200 max-w-full">
										<p class="whitespace-pre-wrap break-words">{streamingContent}<span class="animate-pulse">▌</span></p>
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
							<div class="flex-1 min-w-0">
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
				<!-- Image Warning -->
				{#if imageWarning}
					<div class="mb-3 p-3 bg-yellow-600/20 border border-yellow-500/50 rounded-lg flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span class="text-yellow-400">⚠️</span>
							<span class="text-sm text-yellow-300">{imageWarning}</span>
						</div>
						<button on:click={() => imageWarning = null} class="text-yellow-400 hover:text-yellow-300">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/if}

				<!-- Options Bar -->
				<div class="flex items-center gap-2 mb-3 flex-wrap">
					<!-- Web Search Toggle (一番左) -->
					<button
						on:click={() => { enableSearch = !enableSearch; if (enableSearch) enableImageGen = false; }}
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

					<!-- Template Selector -->
					<div class="relative">
						<button
							on:click={() => showTemplateSelector = !showTemplateSelector}
							class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors {selectedTemplateId ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' : 'bg-dark-800 border-dark-700 text-dark-400 hover:bg-dark-700'}"
						>
							<span class="text-base">📝</span>
							{selectedTemplateId ? getSelectedTemplate()?.name || 'テンプレート' : 'テンプレート'}
							{#if selectedTemplateId}
								<button
									on:click|stopPropagation={() => selectedTemplateId = null}
									class="ml-1 text-emerald-400 hover:text-emerald-300"
								>
									<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							{/if}
						</button>

						{#if showTemplateSelector}
							<div class="absolute bottom-full left-0 mb-2 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-10 p-3 min-w-[250px]">
								<div class="flex items-center justify-between mb-2">
									<p class="text-xs text-dark-500">テンプレートを選択</p>
									<button
										on:click={() => { showTemplateSelector = false; openTemplateEditor(); }}
										class="text-xs text-primary-400 hover:underline"
									>
										+ 新規作成
									</button>
								</div>
								{#if templates.length === 0}
									<p class="text-xs text-dark-500 py-2">テンプレートがありません</p>
								{:else}
									<div class="space-y-1.5 max-h-48 overflow-y-auto">
										{#each templates as template}
											<button
												on:click={() => { selectedTemplateId = template.id; showTemplateSelector = false; }}
												class="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors {selectedTemplateId === template.id ? 'bg-emerald-600/20 border border-emerald-500/50 text-emerald-400' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}"
											>
												<span class="flex-1 text-left truncate">{template.name}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Mode Selector: Text / Image -->
					<div class="flex items-center gap-1 p-1 bg-dark-800 rounded-lg">
						<button
							on:click={() => { enableImageGen = false; }}
							class="flex items-center gap-1.5 px-3 py-1 rounded-md text-sm transition-colors {!enableImageGen ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-dark-200'}"
						>
							<span class="text-sm">💬</span>
							テキスト
						</button>
						<button
							on:click={() => { enableImageGen = true; enableSearch = false; }}
							class="flex items-center gap-1.5 px-3 py-1 rounded-md text-sm transition-colors {enableImageGen ? 'bg-pink-600 text-white' : 'text-dark-400 hover:text-dark-200'}"
						>
							<span class="text-sm">🎨</span>
							画像
						</button>
					</div>

					{#if enableImageGen}
						<!-- Image Model Selector -->
						<div class="relative">
							<button
								on:click={() => showImageModelSelector = !showImageModelSelector}
								class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors bg-dark-800 border-dark-700 text-dark-300 hover:bg-dark-700 hover:text-dark-200"
							>
								<span class="text-base">🖼️</span>
								{imageModels.find(m => m.id === selectedImageModel)?.name || 'FLUX.1'}
								<span class="px-1.5 py-0.5 text-xs bg-pink-600/30 text-pink-400 rounded">
									{imageModels.find(m => m.id === selectedImageModel)?.cost || '無料'}
								</span>
							</button>

							{#if showImageModelSelector}
								<div class="absolute bottom-full left-0 mb-2 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-10 p-3 min-w-[280px]">
									<p class="text-xs text-dark-500 px-2 py-1 mb-2">画像生成モデルを選択</p>
									<div class="space-y-1.5">
										{#each imageModels as model}
											<button
												on:click={() => { selectedImageModel = model.id; showImageModelSelector = false; }}
												class="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors {selectedImageModel === model.id ? 'bg-pink-600/20 border border-pink-500/50 text-pink-400' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}"
											>
												<span class="flex-1 text-left">{model.name}</span>
												<span class="text-xs text-dark-400">{model.desc}</span>
												<span class="px-1.5 py-0.5 text-xs bg-pink-600/30 text-pink-400 rounded">{model.cost}</span>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{:else}
						<!-- LLM Model Selector Button -->
						<div class="relative">
							<button
								on:click={() => showModelSelector = !showModelSelector}
								class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors bg-dark-800 border-dark-700 text-dark-300 hover:bg-dark-700 hover:text-dark-200"
							>
								<span class="text-base">{getSelectedModel().icon}</span>
								{getSelectedModel().name}
								<span class="px-1.5 py-0.5 text-xs bg-blue-600/30 text-blue-400 rounded">{getSelectedModel().contextLength}</span>
								{#if getSelectedModel().longContext}
									<span class="px-1.5 py-0.5 text-xs bg-green-600/30 text-green-400 rounded">履歴参照</span>
								{/if}
								{#if getSelectedModel().reasoning}
									<span class="px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-400 rounded">推論</span>
								{/if}
							</button>

							{#if showModelSelector}
								<div class="absolute bottom-full left-0 mb-2 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-10 p-3 min-w-[400px]">
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
												{#if model.longContext}
													<span class="px-1.5 py-0.5 text-xs bg-green-600/30 text-green-400 rounded">履歴参照</span>
												{/if}
												{#if model.reasoning}
													<span class="px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-400 rounded">推論</span>
												{/if}
												<span class="text-xs text-dark-200 font-medium opacity-0 group-hover/model:opacity-100 transition-opacity whitespace-nowrap">{calcDailyConversations(model)}</span>
											</button>
										{/each}
									</div>
									<p class="text-xs text-dark-500 mt-2 px-2">※ホバーで1000円/月予算の目安表示</p>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Input Field -->
				<div class="flex items-end gap-2">
					<textarea
						bind:value={inputMessage}
						bind:this={textareaRef}
						on:keydown={handleKeydown}
						on:input={autoResizeTextarea}
						placeholder={enableImageGen ? "生成したい画像を説明..." : "メッセージを入力..."}
						rows="1"
						class="input-field flex-1 resize-none min-h-[42px] max-h-[200px] overflow-y-auto"
						style="height: auto;"
						disabled={loading}
					></textarea>
					<button
						on:click={sendMessage}
						disabled={loading || !inputMessage.trim()}
						class="btn-primary px-4 h-[42px] flex-shrink-0"
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

<!-- Click outside to close selectors -->
{#if showModelSelector || showImageModelSelector}
	<button
		class="fixed inset-0 z-0"
		on:click={() => { showModelSelector = false; showImageModelSelector = false; }}
		aria-label="Close selector"
	></button>
{/if}

<!-- Settings Modal -->
{#if showSettings}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-dark-700">
				<h2 class="text-lg font-semibold text-white">設定</h2>
				<button on:click={() => showSettings = false} class="text-dark-400 hover:text-white" aria-label="Close settings">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="p-4 space-y-6 overflow-y-auto max-h-[60vh]">
				<!-- Default Provider -->
				<div>
					<h3 class="text-sm font-medium text-dark-300 mb-2">デフォルトプロバイダー</h3>
					<div class="flex gap-2">
						<button
							on:click={() => selectProvider('together')}
							class="flex-1 px-4 py-2 rounded-lg border text-sm transition-colors {selectedProvider === 'together' ? 'bg-primary-600 border-primary-500 text-white' : 'bg-dark-800 border-dark-700 text-dark-300 hover:bg-dark-700'}"
						>
							Together AI
						</button>
						<button
							on:click={() => selectProvider('openrouter')}
							class="flex-1 px-4 py-2 rounded-lg border text-sm transition-colors {selectedProvider === 'openrouter' ? 'bg-primary-600 border-primary-500 text-white' : 'bg-dark-800 border-dark-700 text-dark-300 hover:bg-dark-700'}"
						>
							OpenRouter
						</button>
					</div>
				</div>

				<!-- Default Text Model -->
				<div>
					<h3 class="text-sm font-medium text-dark-300 mb-2">デフォルトテキストモデル</h3>
					<div class="space-y-1.5 max-h-48 overflow-y-auto">
						{#each getModels() as model}
							<button
								on:click={() => selectModel(model.id)}
								class="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors {selectedModel === model.id ? 'bg-primary-600/20 border border-primary-500/50 text-primary-400' : 'bg-dark-800 text-dark-300 hover:bg-dark-700'}"
							>
								<span class="text-base">{model.icon}</span>
								<span class="flex-1 text-left">{model.name}</span>
								<span class="text-xs text-dark-400">{model.desc}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Default Image Model -->
				<div>
					<h3 class="text-sm font-medium text-dark-300 mb-2">デフォルト画像モデル</h3>
					<div class="space-y-1.5">
						{#each imageModels as model}
							<button
								on:click={() => selectedImageModel = model.id}
								class="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors {selectedImageModel === model.id ? 'bg-pink-600/20 border border-pink-500/50 text-pink-400' : 'bg-dark-800 text-dark-300 hover:bg-dark-700'}"
							>
								<span class="flex-1 text-left">{model.name}</span>
								<span class="text-xs text-dark-400">{model.desc}</span>
								<span class="px-1.5 py-0.5 text-xs bg-pink-600/30 text-pink-400 rounded">{model.cost}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Prompt Templates -->
				<div>
					<div class="flex items-center justify-between mb-2">
						<h3 class="text-sm font-medium text-dark-300">テンプレートプロンプト</h3>
						<button
							on:click={() => { showSettings = false; openTemplateEditor(); }}
							class="text-xs text-primary-400 hover:underline"
						>
							+ 新規作成
						</button>
					</div>
					{#if templates.length === 0}
						<p class="text-xs text-dark-500 py-2">テンプレートがありません。新規作成してください。</p>
					{:else}
						<div class="space-y-1.5 max-h-32 overflow-y-auto">
							{#each templates as template}
								<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-800 text-dark-300">
									<span class="flex-1 text-sm truncate">{template.name}</span>
									<button
										on:click={() => { showSettings = false; openTemplateEditor(template); }}
										class="text-xs text-dark-400 hover:text-primary-400"
									>
										編集
									</button>
									<button
										on:click={() => deleteTemplate(template.id)}
										class="text-xs text-dark-400 hover:text-red-400"
									>
										削除
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- About -->
				<div class="pt-4 border-t border-dark-700">
					<h3 class="text-sm font-medium text-dark-300 mb-2">アプリ情報</h3>
					<div class="text-xs text-dark-500 space-y-1">
						<p>SatomatashikiAIchat v1.0</p>
						<p>Powered by Together AI & OpenRouter</p>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="p-4 border-t border-dark-700">
				<button on:click={() => showSettings = false} class="btn-primary w-full">
					閉じる
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- History Modal -->
{#if showHistory}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-dark-700">
				<h2 class="text-lg font-semibold text-white">使用履歴</h2>
				<button on:click={() => showHistory = false} class="text-dark-400 hover:text-white" aria-label="Close history">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Calendar -->
			<div class="p-4">
				<!-- Month Navigation -->
				<div class="flex items-center justify-between mb-4">
					<button on:click={() => changeMonth(-1)} class="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
						</svg>
					</button>
					<span class="text-white font-medium">
						{currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
					</span>
					<button on:click={() => changeMonth(1)} class="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</button>
				</div>

				{#if loadingHistory}
					<div class="flex justify-center py-8">
						<div class="w-8 h-8 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin"></div>
					</div>
				{:else}
					<!-- Day Headers -->
					<div class="grid grid-cols-7 gap-1 mb-2">
						{#each ['日', '月', '火', '水', '木', '金', '土'] as day, i}
							<div class="text-center text-xs text-dark-500 py-1 {i === 0 ? 'text-red-400' : ''} {i === 6 ? 'text-blue-400' : ''}">
								{day}
							</div>
						{/each}
					</div>

					<!-- Calendar Days -->
					<div class="grid grid-cols-7 gap-1">
						<!-- Empty cells for days before the first of the month -->
						{#each Array(getFirstDayOfMonth()) as _}
							<div class="aspect-square"></div>
						{/each}

						<!-- Days of the month -->
						{#each Array(getDaysInMonth()) as _, i}
							{@const day = i + 1}
							{@const usage = getUsageForDay(day)}
							{@const dayOfWeek = (getFirstDayOfMonth() + i) % 7}
							<div class="aspect-square flex flex-col items-center justify-center rounded-lg text-sm {usage > 0 ? 'bg-primary-600/20' : 'bg-dark-800'} {dayOfWeek === 0 ? 'text-red-400' : ''} {dayOfWeek === 6 ? 'text-blue-400' : 'text-dark-300'}">
								<span class="text-xs">{day}</span>
								{#if usage > 0}
									<span class="text-[10px] text-primary-400 font-medium">{usage}回</span>
								{/if}
							</div>
						{/each}
					</div>

					<!-- Summary -->
					<div class="mt-4 pt-4 border-t border-dark-700">
						<div class="flex justify-between text-sm">
							<span class="text-dark-400">今月の合計</span>
							<span class="text-white font-medium">{usageHistory.reduce((sum, u) => sum + u.count, 0)}回</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="p-4 border-t border-dark-700">
				<button on:click={() => showHistory = false} class="btn-primary w-full">
					閉じる
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Template Editor Modal -->
{#if showTemplateEditor}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-dark-700">
				<h2 class="text-lg font-semibold text-white">
					{editingTemplate ? 'テンプレート編集' : '新規テンプレート'}
				</h2>
				<button on:click={() => { showTemplateEditor = false; editingTemplate = null; }} class="text-dark-400 hover:text-white" aria-label="Close editor">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="p-4 space-y-4">
				<div>
					<label for="template-name" class="block text-sm font-medium text-dark-300 mb-1">テンプレート名</label>
					<input
						id="template-name"
						type="text"
						bind:value={newTemplateName}
						placeholder="例: 丁寧な回答"
						class="input-field w-full"
					/>
				</div>
				<div>
					<label for="template-content" class="block text-sm font-medium text-dark-300 mb-1">プロンプト内容</label>
					<textarea
						id="template-content"
						bind:value={newTemplateContent}
						placeholder="例: あなたは優秀なアシスタントです。丁寧で分かりやすい日本語で回答してください。"
						rows="6"
						class="input-field w-full resize-none"
					></textarea>
					<p class="text-xs text-dark-500 mt-1">このプロンプトがシステムプロンプトとしてAIに送信されます</p>
				</div>
			</div>

			<!-- Footer -->
			<div class="p-4 border-t border-dark-700 flex gap-2">
				<button on:click={() => { showTemplateEditor = false; editingTemplate = null; }} class="btn-ghost flex-1">
					キャンセル
				</button>
				<button
					on:click={() => editingTemplate ? updateTemplate() : createTemplate()}
					disabled={!newTemplateName.trim() || !newTemplateContent.trim()}
					class="btn-primary flex-1"
				>
					{editingTemplate ? '更新' : '作成'}
				</button>
			</div>
		</div>
	</div>
{/if}
