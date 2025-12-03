<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { marked } from 'marked';

	// マークダウンの設定
	marked.setOptions({
		breaks: true, // 改行を<br>に変換
		gfm: true // GitHub Flavored Markdown
	});

	// マークダウンをHTMLに変換
	function renderMarkdown(text: string): string {
		return marked.parse(text) as string;
	}

	interface Message {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		reasoning?: string;
		sources?: { title: string; url: string; content: string }[];
		image?: string; // 画像生成結果（base64 data URL）
		model?: string; // 使用したLLMモデル
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
		isNew?: boolean; // 新しいモデルを示すタグ
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
	let enableSearch = false; // Tavily Web検索
	let searchUsageRemaining: number | null = null; // 月間残り検索回数
	let enablePerplexity = false; // Perplexity検索
	let perplexityMode: 'solo' | 'withLLM' = 'solo'; // 単体 or +LLM
	let perplexityModel: 'sonar' | 'sonar-reasoning' = 'sonar'; // Perplexityモデル選択
	let enableImageGen = false; // 画像生成モード
	let enableDateTime = false; // 日時情報を追加
	let sidebarOpen = false; // スマホではデフォルトで閉じる
	let streamingContent = '';
	let streamingReasoning = '';
	let selectedProvider: Provider = 'openrouter';
	let selectedModel: string | null = null; // モデル未選択状態
	let showModelSelector = false;
	let previousSelectedModel: string | null = null; // キャンセル用の元選択
	let previousEnableImageGen = false; // キャンセル用の元モード
	let previousSelectedImageModel = ''; // キャンセル用の元画像モデル
	let expandedReasoning: Set<string> = new Set();

	// 検索セレクター
	type SearchType = 'none' | 'tavily' | 'perplexity';
	let selectedSearch: SearchType = 'none';
	let showSearchSelector = false;

	const togetherModels: ModelInfo[] = [
		{ id: 'deepseek-ai/DeepSeek-V3.1', name: 'DeepSeek V3.1', desc: '高性能', icon: '🌊', contextLength: '128K', inputCost: 1.25, outputCost: 1.25 },
		{ id: 'moonshotai/Kimi-K2-Thinking', name: 'Kimi K2 Thinking', desc: '推論', icon: '🌙', reasoning: true, contextLength: '256K', inputCost: 1.20, outputCost: 4.00 },
		{ id: 'deepseek-ai/DeepSeek-R1-0528-tput', name: 'DeepSeek R1', desc: '推論', icon: '🐋', reasoning: true, contextLength: '128K', inputCost: 3.00, outputCost: 7.00 },
		{ id: 'Qwen/Qwen3-Next-80B-A3B-Thinking', name: 'Qwen3 80B Think', desc: '推論・格安', icon: '🔮', reasoning: true, contextLength: '128K', inputCost: 0.15, outputCost: 1.50 },
	];

	const openrouterModels: ModelInfo[] = [
		{ id: 'x-ai/grok-4.1-fast:free', name: 'Grok 4.1 Fast', desc: '無料', icon: '🚀', contextLength: '131K', inputCost: 0, outputCost: 0 },
		{ id: 'deepseek/deepseek-v3.2-speciale', name: 'DeepSeek V3.2 Speciale', desc: 'GPT-5超え・推論', icon: '🌊', reasoning: true, isNew: true, contextLength: '164K', inputCost: 0.28, outputCost: 0.40 },
		{ id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', desc: 'GPT-5同等・格安', icon: '🌊', isNew: true, contextLength: '164K', inputCost: 0.27, outputCost: 0.40 },
		{ id: 'google/gemini-2.5-flash-preview-09-2025', name: 'Gemini 2.5 Flash', desc: '推論・Google', icon: '💎', reasoning: true, contextLength: '1M', inputCost: 0.30, outputCost: 2.50 },
		{ id: 'moonshotai/kimi-k2-thinking', name: 'Kimi K2', desc: '推論', icon: '🌙', reasoning: true, contextLength: '256K', inputCost: 0.45, outputCost: 2.35 },
		{ id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', desc: '推論', icon: '🐋', reasoning: true, contextLength: '164K', inputCost: 0.30, outputCost: 1.20 },
		{ id: 'qwen/qwen3-next-80b-a3b-thinking', name: 'Qwen3 80B Think', desc: '推論・格安', icon: '🔮', reasoning: true, contextLength: '262K', inputCost: 0.12, outputCost: 1.20 },
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
	let imageWarning: string | null = null;
	let showSettings = false;
	let showHistory = false;
	let usageHistory: { date: string; count: number }[] = [];
	let modelStats: { model: string; count: number; has_sources: number }[] = [];

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

	// カラーテーマ
	interface ColorTheme {
		id: string;
		name: string;
		color: string; // プレビュー用のカラー
		light?: boolean; // ライトテーマかどうか
	}

	const colorThemes: ColorTheme[] = [
		// ダークテーマ
		{ id: 'sky', name: 'スカイ', color: '#0ea5e9' },
		{ id: 'ocean', name: 'オーシャン', color: '#3b82f6' },
		{ id: 'violet', name: 'バイオレット', color: '#8b5cf6' },
		{ id: 'rose', name: 'ローズ', color: '#f43f5e' },
		{ id: 'emerald', name: 'エメラルド', color: '#10b981' },
		{ id: 'amber', name: 'アンバー', color: '#f59e0b' },
		// ライトテーマ
		{ id: 'light-sky', name: 'スカイL', color: '#0ea5e9', light: true },
		{ id: 'light-ocean', name: 'オーシャンL', color: '#3b82f6', light: true },
		{ id: 'light-violet', name: 'バイオレットL', color: '#8b5cf6', light: true },
		{ id: 'light-rose', name: 'ローズL', color: '#f43f5e', light: true },
		{ id: 'light-emerald', name: 'エメラルドL', color: '#10b981', light: true },
		{ id: 'light-amber', name: 'アンバーL', color: '#f59e0b', light: true },
	];

	let selectedTheme = 'sky';
	let showThemeSelector = false;
	$: isLightTheme = colorThemes.find(t => t.id === selectedTheme)?.light ?? false;
	$: currentModel = selectedModel ? (selectedProvider === 'together' ? togetherModels : openrouterModels).find(m => m.id === selectedModel) : null;

	// 残高表示
	let providerBalance: string | null = null;
	let loadingBalance = false;

	// カラーテーマを適用
	function applyTheme(themeId: string) {
		selectedTheme = themeId;
		if (themeId === 'sky') {
			document.documentElement.removeAttribute('data-theme');
		} else {
			document.documentElement.setAttribute('data-theme', themeId);
		}
		localStorage.setItem('colorTheme', themeId);
	}

	// 保存されたテーマを読み込み
	function loadSavedTheme() {
		const saved = localStorage.getItem('colorTheme');
		if (saved && colorThemes.some(t => t.id === saved)) {
			applyTheme(saved);
		}
	}

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
		return model?.reasoning === true;
	}

	function getModels(): ModelInfo[] {
		return selectedProvider === 'together' ? togetherModels : openrouterModels;
	}

	function getSelectedModel(): ModelInfo | null {
		if (!selectedModel) return null;
		const models = getModels();
		return models.find(m => m.id === selectedModel) || null;
	}

	// モデルIDから表示情報を取得
	function getModelDisplayInfo(modelId: string): { name: string; icon: string } | null {
		const allModels = [...togetherModels, ...openrouterModels];
		const model = allModels.find(m => m.id === modelId);
		if (model) {
			return { name: model.name, icon: model.icon };
		}
		// 知らないモデルの場合はモデルIDの最後の部分を表示
		const parts = modelId.split('/');
		return { name: parts[parts.length - 1], icon: '🤖' };
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
		// モデル選択をリセット
		selectedModel = null;
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

	// モデルセレクターをトグル
	function toggleModelSelector() {
		showModelSelector = !showModelSelector;
		if (showModelSelector) {
			// 開くときに元の選択を保存
			previousSelectedModel = selectedModel;
			previousEnableImageGen = enableImageGen;
			previousSelectedImageModel = selectedImageModel;
			showTemplateSelector = false;
			showThemeSelector = false;
			showSearchSelector = false;
		}
	}

	// モデル選択をキャンセル
	function cancelModelSelection() {
		selectedModel = previousSelectedModel;
		enableImageGen = previousEnableImageGen;
		selectedImageModel = previousSelectedImageModel;
		showModelSelector = false;
	}

	// テンプレートセレクターをトグル
	function toggleTemplateSelector() {
		showTemplateSelector = !showTemplateSelector;
		if (showTemplateSelector) {
			showModelSelector = false;
			showThemeSelector = false;
			showSearchSelector = false;
		}
	}

	// テーマセレクターをトグル
	function toggleThemeSelector() {
		showThemeSelector = !showThemeSelector;
		if (showThemeSelector) {
			showModelSelector = false;
			showTemplateSelector = false;
			showSearchSelector = false;
		}
	}

	// 検索セレクターをトグル
	function toggleSearchSelector() {
		showSearchSelector = !showSearchSelector;
		if (showSearchSelector) {
			showModelSelector = false;
			showTemplateSelector = false;
			showThemeSelector = false;
		}
	}

	// 検索タイプを選択
	function selectSearch(searchType: SearchType) {
		selectedSearch = searchType;
		showSearchSelector = false;
	}

	onMount(async () => {
		// PC画面サイズ（768px以上）ではサイドバーを開く
		if (window.innerWidth >= 768) {
			sidebarOpen = true;
		}
		// 保存されたテーマを読み込み
		loadSavedTheme();
		await loadConversations();
		await loadTemplates();
		// 初期プロバイダーの残高を取得
		loadProviderBalance(selectedProvider);
		// WEB検索残り回数を取得
		loadSearchUsage();
	});

	// WEB検索残り回数を取得
	async function loadSearchUsage() {
		try {
			const res = await fetch('/api/stats');
			if (res.ok) {
				const data = await res.json();
				if (data.searchUsage) {
					searchUsageRemaining = data.searchUsage.remaining;
				}
			}
		} catch (e) {
			console.error('Failed to load search usage:', e);
		}
	}

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
			// 使用履歴とモデル統計を並列で取得
			const [usageRes, statsRes] = await Promise.all([
				fetch(`/api/usage?year=${year}&month=${month}`),
				fetch(`/api/stats?year=${year}&month=${month}`)
			]);
			if (usageRes.ok) {
				const data = await usageRes.json();
				usageHistory = data.usage || [];
			}
			if (statsRes.ok) {
				const data = await statsRes.json();
				modelStats = data.stats || [];
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
					reasoning: m.reasoning || undefined,
					image: imageUrl,
					sources: m.sources ? JSON.parse(m.sources) : undefined,
					model: m.model || undefined
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

		// 検索設定をselectedSearchから設定（チェック前に設定）
		enableSearch = selectedSearch === 'tavily';
		enablePerplexity = selectedSearch === 'perplexity';

		// Perplexity単体モード（AIchatで分析OFF）の場合はモデル不要
		const isPerplexitySolo = enablePerplexity && perplexityMode === 'solo';

		// モデル未選択チェック（画像生成モード、Perplexity単体モード以外）
		if (!enableImageGen && !isPerplexitySolo && !selectedModel) {
			alert('モデルを選択してください');
			return;
		}

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
			// 日本時間を取得
			const getJapanDateTime = () => {
				const now = new Date();
				const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
				const year = japanTime.getFullYear();
				const month = String(japanTime.getMonth() + 1).padStart(2, '0');
				const day = String(japanTime.getDate()).padStart(2, '0');
				const hours = String(japanTime.getHours()).padStart(2, '0');
				const minutes = String(japanTime.getMinutes()).padStart(2, '0');
				const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
				const weekday = weekdays[japanTime.getDay()];
				return `${year}年${month}月${day}日(${weekday}) ${hours}:${minutes}`;
			};

			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: userMessage,
					conversationId: currentConversationId,
					enableSearch,
					enablePerplexity,
					perplexityMode: enablePerplexity ? perplexityMode : undefined,
					perplexityModel: enablePerplexity ? perplexityModel : undefined,
					model: selectedModel,
					provider: selectedProvider,
					systemPrompt: getSelectedTemplate()?.content || null,
					dateTime: enableDateTime ? getJapanDateTime() : undefined
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

							// WEB検索残り回数を更新
							if (data.searchUsageRemaining !== undefined) {
								searchUsageRemaining = data.searchUsageRemaining;
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
									sources: sources.length > 0 ? sources : undefined,
									model: selectedModel
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
						} catch {
							// Skip invalid JSON
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
					sources: sources.length > 0 ? sources : undefined,
					model: selectedModel
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

<div class="fixed inset-0 flex bg-themed-base overflow-hidden">
	<!-- Mobile Sidebar Overlay -->
	{#if sidebarOpen}
		<button
			class="fixed inset-0 bg-black/50 z-40 md:hidden"
			on:click={() => sidebarOpen = false}
			aria-label="Close sidebar"
		></button>
	{/if}

	<!-- Sidebar -->
	<div class="fixed md:relative w-64 h-full bg-themed-sidebar border-r border-themed-border flex flex-col z-50 transition-transform duration-300 flex-shrink-0 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0">
		<div class="p-4 border-b border-themed-border">
			<button on:click={newChat} class="btn-primary w-full flex items-center justify-center gap-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				新しいチャット
			</button>
		</div>

		<div class="flex-1 overflow-y-auto p-2">
			{#each conversations.slice(0, 15) as conv}
				<div class="group flex items-center gap-2 p-2 rounded-lg hover:bg-themed-elevated cursor-pointer {currentConversationId === conv.id ? 'bg-themed-elevated' : ''}">
					<button
						on:click={() => loadConversation(conv.id)}
						class="flex-1 text-left text-sm text-themed-text-secondary truncate"
					>
						{conv.title}
					</button>
					<button
						on:click|stopPropagation={() => deleteConversation(conv.id)}
						class="opacity-0 group-hover:opacity-100 p-1 text-themed-text-muted hover:text-red-400"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
				</div>
			{/each}
			{#if conversations.length > 15}
				<p class="text-xs text-themed-text-muted text-center py-2">他{conversations.length - 15}件の履歴</p>
			{/if}
		</div>

		<div class="p-4 border-t border-themed-border space-y-2">
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
	<div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
		<!-- Header -->
		<header class="h-14 flex-shrink-0 border-b border-themed-border flex items-center px-4 gap-2 sm:gap-4 overflow-visible relative z-50" style="padding-top: env(safe-area-inset-top);">
			<button on:click={() => sidebarOpen = !sidebarOpen} class="md:hidden p-2 -ml-2 text-themed-text-secondary active:bg-themed-elevated rounded-lg" aria-label="Toggle sidebar">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<!-- Mobile: New Chat Button + Title -->
			<button on:click={newChat} class="md:hidden p-2 text-primary-400 active:bg-themed-elevated rounded-lg flex-shrink-0" aria-label="新しいチャット">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
			</button>
			<!-- Mobile Title -->
			<span class="md:hidden font-semibold text-themed-text text-sm truncate">SatomatashikiAIchat</span>
			<!-- Desktop: Logo + Title -->
			<button on:click={newChat} class="hidden md:flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0">
				<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
					<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
					</svg>
				</div>
				<span class="font-semibold text-themed-text">SatomatashikiAIchat</span>
			</button>

			<!-- Provider Selector in Header -->
			<div class="flex items-center gap-0.5 p-0.5 bg-themed-elevated rounded-lg flex-shrink-0">
				<button
					on:click={() => selectProvider('together')}
					class="px-2 py-1 rounded-md text-xs sm:text-sm transition-colors {selectedProvider === 'together' ? 'bg-primary-600 text-white' : 'text-themed-text-secondary hover:text-themed-text'}"
				>
					<span class="hidden sm:inline">Together</span>
					<span class="sm:hidden">T</span>
				</button>
				<button
					on:click={() => selectProvider('openrouter')}
					class="px-2 py-1 rounded-md text-xs sm:text-sm transition-colors {selectedProvider === 'openrouter' ? 'bg-primary-600 text-white' : 'text-themed-text-secondary hover:text-themed-text'}"
				>
					<span class="hidden sm:inline">OpenRouter</span>
					<span class="sm:hidden">OR</span>
				</button>
			</div>

			<!-- Balance Display -->
			<div class="text-xs text-themed-text-secondary hidden sm:block flex-shrink-0">
				{#if selectedProvider === 'openrouter'}
					{#if loadingBalance}
						<span class="text-themed-text-muted">読込中...</span>
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

			<!-- Color Theme Selector -->
			<div class="relative z-[100]">
				<button
					on:click={toggleThemeSelector}
					class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-themed-text-secondary hover:text-themed-text hover:bg-themed-elevated transition-colors"
					aria-label="テーマカラーを選択"
				>
					<div class="w-5 h-5 rounded-full border-2 border-dark-600" style="background-color: {colorThemes.find(t => t.id === selectedTheme)?.color}"></div>
					<svg class="w-4 h-4 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
					</svg>
				</button>

				{#if showThemeSelector}
					<div class="absolute right-0 top-full mt-2 bg-themed-elevated border border-themed-border rounded-xl shadow-xl p-3 min-w-[200px] sm:min-w-[220px] z-[200]">
						<p class="text-xs text-themed-text-muted mb-2 px-1">ダーク</p>
						<div class="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3">
							{#each colorThemes.filter(t => !t.light) as theme}
								<button
									on:click={() => { applyTheme(theme.id); showThemeSelector = false; }}
									class="flex flex-col items-center gap-1 p-1.5 sm:p-2 rounded-lg transition-colors {selectedTheme === theme.id ? 'ring-2 ring-primary-500 bg-black/20' : 'hover:bg-black/10'}"
								>
									<div class="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 {selectedTheme === theme.id ? 'border-white' : 'border-themed-border'}" style="background-color: {theme.color}"></div>
									<span class="text-[9px] sm:text-[10px] text-themed-text-secondary">{theme.name}</span>
								</button>
							{/each}
						</div>
						<p class="text-xs text-themed-text-muted mb-2 px-1">ライト</p>
						<div class="grid grid-cols-3 gap-1.5 sm:gap-2">
							{#each colorThemes.filter(t => t.light) as theme}
								<button
									on:click={() => { applyTheme(theme.id); showThemeSelector = false; }}
									class="flex flex-col items-center gap-1 p-1.5 sm:p-2 rounded-lg transition-colors {selectedTheme === theme.id ? 'ring-2 ring-primary-500 bg-white/20' : 'hover:bg-white/10'}"
								>
									<div class="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 {selectedTheme === theme.id ? 'border-gray-800' : 'border-themed-border'}" style="background-color: {theme.color}; background: linear-gradient(135deg, {theme.color} 50%, white 50%);"></div>
									<span class="text-[9px] sm:text-[10px] text-themed-text-secondary">{theme.name}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</header>

		<!-- Messages -->
		<div class="flex-1 h-0 overflow-y-auto overflow-x-hidden p-4 relative z-0" style="padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right)); -webkit-overflow-scrolling: touch;">
			{#if loadingConversation}
				<div class="h-full flex flex-col items-center justify-center text-center">
					<div class="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mb-4"></div>
					<p class="text-themed-text-secondary">読み込み中...</p>
				</div>
			{:else if messages.length === 0 && !streamingContent && !streamingReasoning}
				<div class="h-full flex flex-col items-center justify-center text-center">
					<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mb-4">
						<svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<h2 class="text-2xl font-bold text-themed-text mb-2">SatomatashikiAIchat</h2>
					<p class="text-themed-text-secondary max-w-md">
						質問を入力してください。Web検索を有効にすると、最新情報を元に回答します。
					</p>
				</div>
			{:else}
				<div class="max-w-3xl mx-auto space-y-6 overflow-hidden w-full">
					{#each messages as message}
						<div class="flex gap-4 {message.role === 'user' ? 'flex-row-reverse' : ''}">
							<div class="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center {message.role === 'user' ? 'bg-primary-600' : 'bg-themed-surface'}">
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
											class="flex items-center gap-2 text-xs text-themed-text-secondary hover:text-themed-text-secondary transition-colors"
										>
											<span class="text-base">📘</span>
											思考過程
											<svg class="w-3 h-3 transition-transform {expandedReasoning.has(message.id) ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
											</svg>
										</button>
										{#if expandedReasoning.has(message.id)}
											<div class="mt-2 p-3 bg-themed-surface border border-themed-border rounded-xl text-xs text-themed-text-secondary whitespace-pre-wrap max-h-64 overflow-y-auto">
												{message.reasoning}
											</div>
										{/if}
									</div>
								{/if}
								<div class="inline-block text-left rounded-2xl px-4 py-3 max-w-full overflow-hidden {message.role === 'user' ? 'bg-primary-600 text-white' : 'bg-themed-elevated text-themed-text'}">
									{#if message.role === 'assistant'}
										<div class="prose prose-sm max-w-none break-words overflow-wrap-anywhere overflow-x-hidden" style="--tw-prose-body: rgb(var(--text-primary, 226 232 240)); --tw-prose-headings: rgb(var(--text-primary, 226 232 240)); --tw-prose-bold: rgb(var(--text-primary, 226 232 240)); --tw-prose-links: rgb(var(--primary-400)); --tw-prose-code: rgb(var(--text-primary, 226 232 240));">
											{@html renderMarkdown(message.content)}
										</div>
									{:else}
										<p class="whitespace-pre-wrap break-words overflow-wrap-anywhere overflow-x-hidden">{message.content}</p>
									{/if}
								</div>
								{#if message.image}
									<div class="mt-2">
										<img src={message.image} alt="Generated image" class="max-w-md rounded-xl border border-themed-border shadow-lg" />
										<a href={message.image} download="generated-image.png" class="inline-block mt-2 text-xs text-primary-400 hover:underline">
											画像をダウンロード
										</a>
									</div>
								{/if}
								{#if message.role === 'assistant' && message.model}
									{@const modelInfo = getModelDisplayInfo(message.model)}
									<div class="mt-2 flex items-center gap-1 text-xs text-themed-text-muted">
										<span>{modelInfo?.icon}</span>
										<span>{modelInfo?.name}</span>
									</div>
								{/if}
								{#if message.sources && message.sources.length > 0}
									<div class="mt-2 pt-2 border-t border-themed-border/50">
										<div class="flex items-center gap-1 text-xs text-green-400 mb-1">
											<span>🔍</span>
											<span class="font-medium">Tavily Web検索</span>
											<span class="text-themed-text-muted">({message.sources.length}件)</span>
										</div>
										<div class="space-y-0.5">
											{#each message.sources as source}
												<a href={source.url} target="_blank" rel="noopener" class="block text-xs text-primary-400 hover:underline truncate">
													{source.title}
												</a>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						</div>
					{/each}

					{#if streamingReasoning || streamingContent}
						<div class="flex gap-4">
							<div class="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-themed-surface">
								<svg class="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
								</svg>
							</div>
							<div class="flex-1 min-w-0">
								{#if streamingReasoning}
									<div class="mb-2">
										<div class="flex items-center gap-2 text-xs text-themed-text-secondary mb-2">
											<span class="text-base">📘</span>
											思考中...
										</div>
										<div class="p-3 bg-themed-surface border border-themed-border rounded-xl text-xs text-themed-text-secondary whitespace-pre-wrap max-h-64 overflow-y-auto break-words">
											{streamingReasoning}<span class="animate-pulse">▌</span>
										</div>
									</div>
								{/if}
								{#if streamingContent}
									<div class="inline-block text-left rounded-2xl px-4 py-3 bg-themed-elevated text-themed-text max-w-full">
										<div class="prose prose-sm max-w-none break-words overflow-wrap-anywhere" style="--tw-prose-body: rgb(var(--text-primary, 226 232 240)); --tw-prose-headings: rgb(var(--text-primary, 226 232 240)); --tw-prose-bold: rgb(var(--text-primary, 226 232 240)); --tw-prose-links: rgb(var(--primary-400)); --tw-prose-code: rgb(var(--text-primary, 226 232 240));">
											{@html renderMarkdown(streamingContent)}<span class="animate-pulse">▌</span>
										</div>
									</div>
									{#if selectedModel}
										{@const modelInfo = getModelDisplayInfo(selectedModel)}
										<div class="mt-2 flex items-center gap-1 text-xs text-themed-text-muted">
											<span>{modelInfo?.icon}</span>
											<span>{modelInfo?.name}</span>
										</div>
									{/if}
								{/if}
							</div>
						</div>
					{/if}

					{#if loading && !streamingContent}
						<div class="flex gap-4">
							<div class="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-themed-surface">
								<svg class="w-5 h-5 text-primary-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
								</svg>
							</div>
							<div class="flex-1 min-w-0">
								<div class="inline-block rounded-2xl px-4 py-3 bg-themed-elevated">
									<div class="flex gap-1">
										<span class="w-2 h-2 bg-themed-text-muted rounded-full animate-bounce" style="animation-delay: 0ms"></span>
										<span class="w-2 h-2 bg-themed-text-muted rounded-full animate-bounce" style="animation-delay: 150ms"></span>
										<span class="w-2 h-2 bg-themed-text-muted rounded-full animate-bounce" style="animation-delay: 300ms"></span>
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Input -->
		<div class="flex-shrink-0 border-t border-themed-border p-4 overflow-visible relative z-30" style="padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right)); padding-bottom: max(1rem, env(safe-area-inset-bottom));">
			<div class="max-w-3xl mx-auto w-full relative">
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
				<div class="flex items-center gap-1 sm:gap-2 mb-3 overflow-x-auto">
					<!-- 検索セレクター -->
					<div class="relative flex-shrink-0">
						<button
							on:click={toggleSearchSelector}
							class="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg border text-xs sm:text-sm transition-colors {selectedSearch !== 'none' ? 'bg-primary-600/20 border-primary-500/50 text-primary-400' : 'bg-themed-elevated border-themed-border text-themed-text-secondary hover:bg-themed-elevated'}"
						>
							<span class="text-sm sm:text-base">🔍</span>
							{#if selectedSearch === 'none'}
								<span class="hidden sm:inline">検索OFF</span>
							{:else if selectedSearch === 'tavily'}
								<span>Tavily</span>
								<span class="hidden sm:inline text-xs opacity-75">残{searchUsageRemaining !== null ? searchUsageRemaining : '---'}回</span>
							{:else if selectedSearch === 'perplexity'}
								<span class="hidden sm:inline">Perplexity</span>
								<span class="sm:hidden">Pplx</span>
							{/if}
							<svg class="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>

					</div>

					<!-- DateTime Toggle -->
					<button
						on:click={() => enableDateTime = !enableDateTime}
						class="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs sm:text-sm transition-colors whitespace-nowrap flex-shrink-0 {enableDateTime ? 'bg-amber-600/20 border-amber-500/50 text-amber-400' : 'bg-themed-elevated border-themed-border text-themed-text-secondary hover:bg-themed-elevated'}"
					>
						<span class="text-sm sm:text-base">🕐</span>
						<span class="hidden sm:inline">日時</span>
						{#if enableDateTime}
							<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
						{/if}
					</button>

					<!-- Template Selector -->
					<div class="relative flex-shrink-0 flex items-center gap-0.5 sm:gap-1">
						<button
							on:click={() => showTemplateSelector = !showTemplateSelector}
							class="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs sm:text-sm transition-colors whitespace-nowrap {selectedTemplateId ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' : 'bg-themed-elevated border-themed-border text-themed-text-secondary hover:bg-themed-elevated'}"
						>
							<span class="text-sm sm:text-base">📝</span>
							<span class="hidden sm:inline">{selectedTemplateId ? getSelectedTemplate()?.name || 'テンプレート' : 'テンプレート'}</span>
						</button>
						{#if selectedTemplateId}
							<button
								on:click={() => selectedTemplateId = null}
								class="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-600/20 rounded-lg transition-colors"
								aria-label="テンプレートを解除"
							>
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						{/if}

					</div>

					<!-- AI Model Selector (Text + Image combined) -->
					<div class="relative flex-shrink-0">
						<button
							on:click={toggleModelSelector}
							class="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs sm:text-sm transition-colors whitespace-nowrap {enableImageGen ? 'bg-pink-600/20 border-pink-500/50 text-pink-400' : currentModel ? 'bg-themed-elevated border-themed-border text-themed-text-secondary hover:bg-themed-elevated hover:text-themed-text' : 'bg-amber-600/20 border-amber-500/50 text-amber-400 hover:bg-amber-600/30'}"
						>
							{#if enableImageGen}
								<span class="text-sm sm:text-base">🎨</span>
								<span class="hidden sm:inline">{imageModels.find(m => m.id === selectedImageModel)?.name || 'FLUX.1'}</span>
								<span class="px-1 sm:px-1.5 py-0.5 text-xs bg-pink-600/30 text-pink-400 rounded">
									{imageModels.find(m => m.id === selectedImageModel)?.cost || '無料'}
								</span>
							{:else if currentModel}
								<span class="text-sm sm:text-base">{currentModel.icon}</span>
								<span class="hidden sm:inline">{currentModel.name}</span>
								<span class="hidden sm:inline px-1.5 py-0.5 text-xs bg-blue-600/30 text-blue-400 rounded">{currentModel.contextLength}</span>
								{#if currentModel.reasoning}
									<span class="hidden sm:inline px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-400 rounded">推論</span>
								{/if}
							{:else}
								<span class="text-sm sm:text-base">🤖</span>
								<span class="hidden sm:inline">AIchatモデル選択</span>
								<span class="sm:hidden">モデル</span>
							{/if}
							<svg class="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>

					</div>
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


<!-- Settings Modal -->
{#if showSettings}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-themed-surface border border-themed-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-themed-border">
				<h2 class="text-lg font-semibold text-white">設定</h2>
				<button on:click={() => showSettings = false} class="text-themed-text-secondary hover:text-white" aria-label="Close settings">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="p-4 space-y-6 overflow-y-auto max-h-[60vh]">
				<!-- Color Theme -->
				<div>
					<h3 class="text-sm font-medium text-themed-text-secondary mb-2">テーマカラー</h3>
					<p class="text-xs text-themed-text-muted mb-2">ダーク</p>
					<div class="grid grid-cols-6 gap-2 mb-4">
						{#each colorThemes.filter(t => !t.light) as theme}
							<button
								on:click={() => applyTheme(theme.id)}
								class="flex flex-col items-center gap-1 p-2 rounded-lg transition-colors {selectedTheme === theme.id ? 'ring-2 ring-primary-500 bg-black/20' : 'hover:bg-black/10'}"
							>
								<div class="w-8 h-8 rounded-full border-2 {selectedTheme === theme.id ? 'border-white' : 'border-themed-border'}" style="background-color: {theme.color}"></div>
								<span class="text-[10px] text-themed-text-secondary">{theme.name}</span>
							</button>
						{/each}
					</div>
					<p class="text-xs text-themed-text-muted mb-2">ライト</p>
					<div class="grid grid-cols-6 gap-2">
						{#each colorThemes.filter(t => t.light) as theme}
							<button
								on:click={() => applyTheme(theme.id)}
								class="flex flex-col items-center gap-1 p-2 rounded-lg transition-colors {selectedTheme === theme.id ? 'ring-2 ring-primary-500 bg-white/20' : 'hover:bg-white/10'}"
							>
								<div class="w-8 h-8 rounded-full border-2 {selectedTheme === theme.id ? 'border-gray-800' : 'border-themed-border'}" style="background-color: {theme.color}; background: linear-gradient(135deg, {theme.color} 50%, white 50%);"></div>
								<span class="text-[10px] text-themed-text-secondary">{theme.name}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Default Provider -->
				<div>
					<h3 class="text-sm font-medium text-themed-text-secondary mb-2">デフォルトプロバイダー</h3>
					<div class="flex gap-2">
						<button
							on:click={() => selectProvider('together')}
							class="flex-1 px-4 py-2 rounded-lg border text-sm transition-colors {selectedProvider === 'together' ? 'bg-primary-600 border-primary-500 text-white' : 'bg-themed-elevated border-themed-border text-themed-text-secondary hover:bg-themed-elevated'}"
						>
							Together AI
						</button>
						<button
							on:click={() => selectProvider('openrouter')}
							class="flex-1 px-4 py-2 rounded-lg border text-sm transition-colors {selectedProvider === 'openrouter' ? 'bg-primary-600 border-primary-500 text-white' : 'bg-themed-elevated border-themed-border text-themed-text-secondary hover:bg-themed-elevated'}"
						>
							OpenRouter
						</button>
					</div>
				</div>

				<!-- Default Text Model -->
				<div>
					<h3 class="text-sm font-medium text-themed-text-secondary mb-2">デフォルトテキストモデル</h3>
					<div class="space-y-1.5 max-h-48 overflow-y-auto">
						{#each getModels() as model}
							<button
								on:click={() => selectModel(model.id)}
								class="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors {selectedModel === model.id ? 'bg-primary-600/20 border border-primary-500/50 text-primary-400' : 'bg-themed-elevated text-themed-text-secondary hover:bg-themed-elevated'}"
							>
								<span class="text-base">{model.icon}</span>
								<span class="flex-1 text-left">{model.name}</span>
								<span class="text-xs text-themed-text-secondary">{model.desc}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Default Image Model -->
				<div>
					<h3 class="text-sm font-medium text-themed-text-secondary mb-2">デフォルト画像モデル</h3>
					<div class="space-y-1.5">
						{#each imageModels as model}
							<button
								on:click={() => selectedImageModel = model.id}
								class="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors {selectedImageModel === model.id ? 'bg-pink-600/20 border border-pink-500/50 text-pink-400' : 'bg-themed-elevated text-themed-text-secondary hover:bg-themed-elevated'}"
							>
								<span class="flex-1 text-left">{model.name}</span>
								<span class="text-xs text-themed-text-secondary">{model.desc}</span>
								<span class="px-1.5 py-0.5 text-xs bg-pink-600/30 text-pink-400 rounded">{model.cost}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Prompt Templates -->
				<div>
					<div class="flex items-center justify-between mb-2">
						<h3 class="text-sm font-medium text-themed-text-secondary">テンプレートプロンプト</h3>
						<button
							on:click={() => { showSettings = false; openTemplateEditor(); }}
							class="text-xs text-primary-400 hover:underline"
						>
							+ 新規作成
						</button>
					</div>
					{#if templates.length === 0}
						<p class="text-xs text-themed-text-muted py-2">テンプレートがありません。新規作成してください。</p>
					{:else}
						<div class="space-y-1.5 max-h-32 overflow-y-auto">
							{#each templates as template}
								<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-themed-elevated text-themed-text-secondary">
									<span class="flex-1 text-sm truncate">{template.name}</span>
									<button
										on:click={() => { showSettings = false; openTemplateEditor(template); }}
										class="text-xs text-themed-text-secondary hover:text-primary-400"
									>
										編集
									</button>
									<button
										on:click={() => deleteTemplate(template.id)}
										class="text-xs text-themed-text-secondary hover:text-red-400"
									>
										削除
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- About -->
				<div class="pt-4 border-t border-themed-border">
					<h3 class="text-sm font-medium text-themed-text-secondary mb-2">アプリ情報</h3>
					<div class="text-xs text-themed-text-muted space-y-1">
						<p>SatomatashikiAIchat v1.0</p>
						<p>Powered by Together AI & OpenRouter</p>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="p-4 border-t border-themed-border">
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
		<div class="bg-themed-surface border border-themed-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-themed-border">
				<h2 class="text-lg font-semibold text-white">使用履歴</h2>
				<button on:click={() => showHistory = false} class="text-themed-text-secondary hover:text-white" aria-label="Close history">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Calendar -->
			<div class="p-4">
				<!-- Month Navigation -->
				<div class="flex items-center justify-between mb-4">
					<button on:click={() => changeMonth(-1)} class="p-2 text-themed-text-secondary hover:text-white rounded-lg hover:bg-themed-elevated">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
						</svg>
					</button>
					<span class="text-white font-medium">
						{currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
					</span>
					<button on:click={() => changeMonth(1)} class="p-2 text-themed-text-secondary hover:text-white rounded-lg hover:bg-themed-elevated">
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
							<div class="text-center text-xs text-themed-text-muted py-1 {i === 0 ? 'text-red-400' : ''} {i === 6 ? 'text-blue-400' : ''}">
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
							<div class="aspect-square flex flex-col items-center justify-center rounded-lg text-sm {usage > 0 ? 'bg-primary-600/20' : 'bg-themed-elevated'} {dayOfWeek === 0 ? 'text-red-400' : ''} {dayOfWeek === 6 ? 'text-blue-400' : 'text-themed-text-secondary'}">
								<span class="text-xs">{day}</span>
								{#if usage > 0}
									<span class="text-[10px] text-primary-400 font-medium">{usage}回</span>
								{/if}
							</div>
						{/each}
					</div>

					<!-- Summary -->
					{#if true}
						{@const totalUsage = usageHistory.reduce((sum, u) => sum + u.count, 0)}
						{@const daysWithUsage = usageHistory.filter(u => u.count > 0).length}
						{@const dailyAvg = daysWithUsage > 0 ? (totalUsage / daysWithUsage).toFixed(1) : 0}
						<div class="mt-4 pt-4 border-t border-themed-border">
							<div class="flex justify-between text-sm mb-2">
								<span class="text-themed-text-secondary">今月の合計</span>
								<span class="text-white font-medium">{totalUsage}回</span>
							</div>
							<div class="flex justify-between text-sm">
								<span class="text-themed-text-secondary">1日平均（使用日）</span>
								<span class="text-amber-400 font-medium">{dailyAvg}回/日</span>
							</div>
						</div>
					{/if}

					<!-- Model Usage Stats -->
					{#if modelStats.length > 0}
						{@const totalMessages = modelStats.reduce((sum, s) => sum + s.count, 0)}
						{@const totalSearches = modelStats.reduce((sum, s) => sum + s.has_sources, 0)}
						{@const estimatedCost = modelStats.reduce((sum, s) => {
							const costs: Record<string, { input: number; output: number }> = {
								'deepseek-v3.2-exp': { input: 0.216, output: 0.328 },
								'deepseek-r1': { input: 0.30, output: 1.20 },
								'grok-4.1-fast:free': { input: 0, output: 0 },
								'gemini-2.5-flash-preview': { input: 0.30, output: 2.50 },
								'kimi-k2-thinking': { input: 0.45, output: 2.35 },
								'qwen3-next-80b-a3b-thinking': { input: 0.12, output: 1.20 },
								'sonar': { input: 1, output: 1 },
								'sonar-reasoning': { input: 1, output: 5 },
							};
							const modelKey = s.model?.split('/').pop()?.toLowerCase() || '';
							const cost = Object.entries(costs).find(([k]) => modelKey.includes(k))?.[1] || { input: 0.5, output: 1 };
							return sum + s.count * (cost.input * 0.5 / 1000 + cost.output * 1 / 1000);
						}, 0)}
						<div class="mt-4 pt-4 border-t border-themed-border">
							<h4 class="text-sm font-medium text-themed-text-secondary mb-3">モデル使用統計</h4>

							<!-- Graph -->
							<div class="space-y-2 mb-4">
								{#each modelStats as stat}
									{@const percentage = totalMessages > 0 ? (stat.count / totalMessages) * 100 : 0}
									{@const modelName = stat.model?.split('/').pop() || '不明'}
									<div class="flex items-center gap-2">
										<span class="text-xs text-themed-text-secondary w-24 truncate" title={stat.model}>{modelName}</span>
										<div class="flex-1 h-4 bg-themed-elevated rounded-full overflow-hidden">
											<div
												class="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full transition-all"
												style="width: {percentage}%"
											></div>
										</div>
										<span class="text-xs text-white font-medium w-12 text-right">{stat.count}回</span>
									</div>
								{/each}
							</div>

							<!-- Web検索使用回数 -->
							<div class="flex justify-between text-sm pt-2 border-t border-themed-border/50">
								<span class="text-themed-text-secondary">Web検索使用</span>
								<span class="text-green-400 font-medium">{totalSearches}回</span>
							</div>

							<!-- 概算コスト -->
							<div class="flex justify-between text-sm mt-2">
								<span class="text-themed-text-secondary">概算コスト</span>
								<span class="text-amber-400 font-medium">${estimatedCost.toFixed(3)}</span>
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div class="p-4 border-t border-themed-border">
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
		<div class="bg-themed-surface border border-themed-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-themed-border">
				<h2 class="text-lg font-semibold text-white">
					{editingTemplate ? 'テンプレート編集' : '新規テンプレート'}
				</h2>
				<button on:click={() => { showTemplateEditor = false; editingTemplate = null; }} class="text-themed-text-secondary hover:text-white" aria-label="Close editor">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="p-4 space-y-4">
				<div>
					<label for="template-name" class="block text-sm font-medium text-themed-text-secondary mb-1">テンプレート名</label>
					<input
						id="template-name"
						type="text"
						bind:value={newTemplateName}
						placeholder="例: 丁寧な回答"
						class="input-field w-full"
					/>
				</div>
				<div>
					<label for="template-content" class="block text-sm font-medium text-themed-text-secondary mb-1">プロンプト内容</label>
					<textarea
						id="template-content"
						bind:value={newTemplateContent}
						placeholder="例: あなたは優秀なアシスタントです。丁寧で分かりやすい日本語で回答してください。"
						rows="6"
						class="input-field w-full resize-none"
					></textarea>
					<p class="text-xs text-themed-text-muted mt-1">このプロンプトがシステムプロンプトとしてAIに送信されます</p>
				</div>
			</div>

			<!-- Footer -->
			<div class="p-4 border-t border-themed-border flex gap-2">
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

<!-- Search Selector Modal -->
{#if showSearchSelector}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-themed-surface border border-themed-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-themed-border">
				<h2 class="text-lg font-semibold text-white">Web検索エンジン選択</h2>
				<button on:click={() => showSearchSelector = false} class="text-themed-text-secondary hover:text-white" aria-label="Close">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="p-3 space-y-2">
				<!-- 検索OFF -->
				<button
					on:click={() => selectSearch('none')}
					class="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm transition-colors {selectedSearch === 'none' ? 'bg-primary-600/20 border border-primary-500/50 text-primary-400' : 'bg-themed-elevated text-themed-text-secondary hover:bg-themed-border/50'}"
				>
					<span class="text-xl">❌</span>
					<div class="flex-1 text-left">
						<div class="font-medium">検索OFF</div>
						<div class="text-xs opacity-75">Web検索を使用しない</div>
					</div>
					{#if selectedSearch === 'none'}
						<svg class="w-5 h-5 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
					{/if}
				</button>

				<!-- Tavily -->
				<button
					on:click={() => selectSearch('tavily')}
					class="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm transition-colors {selectedSearch === 'tavily' ? 'bg-primary-600/20 border border-primary-500/50 text-primary-400' : 'bg-themed-elevated text-themed-text-secondary hover:bg-themed-border/50'}"
				>
					<span class="text-xl">🔍</span>
					<div class="flex-1 text-left">
						<div class="font-medium">Tavily検索</div>
						<div class="text-xs opacity-75">AI専用Web検索エンジン（10件取得）</div>
						<div class="text-xs text-amber-400 mt-0.5">月1000回まで（残{searchUsageRemaining !== null ? searchUsageRemaining : '---'}回）</div>
					</div>
					{#if selectedSearch === 'tavily'}
						<svg class="w-5 h-5 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
					{/if}
				</button>

				<!-- Perplexity -->
				<button
					on:click={() => selectSearch('perplexity')}
					class="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm transition-colors {selectedSearch === 'perplexity' ? 'bg-green-600/20 border border-green-500/50 text-green-400' : 'bg-themed-elevated text-themed-text-secondary hover:bg-themed-border/50'}"
				>
					<span class="text-xl">🔎</span>
					<div class="flex-1 text-left">
						<div class="font-medium">Perplexity検索</div>
						<div class="text-xs opacity-75">AI検索LLMで直接回答</div>
						<div class="text-xs text-green-400 mt-0.5">回数制限なし（$1/$1〜$5）</div>
					</div>
					{#if selectedSearch === 'perplexity'}
						<svg class="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
					{/if}
				</button>
			</div>

			<!-- Perplexityオプション -->
			{#if selectedSearch === 'perplexity'}
				<div class="p-3 border-t border-themed-border bg-themed-elevated/50">
					<div class="text-xs text-themed-text-muted mb-2">Perplexityオプション</div>
					<div class="flex gap-2 flex-wrap">
						<button
							on:click={() => perplexityModel = 'sonar'}
							class="flex items-center gap-1 px-3 py-1.5 rounded border text-xs transition-colors {perplexityModel === 'sonar' ? 'bg-green-600 text-white border-green-500' : 'bg-themed-surface border-themed-border text-themed-text-secondary hover:bg-themed-elevated'}"
						>
							sonar <span class="opacity-75">$1/$1</span>
						</button>
						<button
							on:click={() => perplexityModel = 'sonar-reasoning'}
							class="flex items-center gap-1 px-3 py-1.5 rounded border text-xs transition-colors {perplexityModel === 'sonar-reasoning' ? 'bg-purple-600 text-white border-purple-500' : 'bg-themed-surface border-themed-border text-themed-text-secondary hover:bg-themed-elevated'}"
						>
							推論 <span class="opacity-75">$1/$5</span>
						</button>
						<button
							on:click={() => perplexityMode = perplexityMode === 'withLLM' ? 'solo' : 'withLLM'}
							class="flex items-center gap-1 px-3 py-1.5 rounded border text-xs transition-colors {perplexityMode === 'withLLM' ? 'bg-amber-600 text-white border-amber-500' : 'bg-themed-surface border-themed-border text-themed-text-secondary hover:bg-themed-elevated'}"
						>
							🤖 AIchatで分析 {perplexityMode === 'withLLM' ? '✓' : ''}
						</button>
					</div>
				</div>
			{/if}

			<!-- Footer -->
			<div class="p-3 border-t border-themed-border">
				<button on:click={() => showSearchSelector = false} class="btn-primary w-full">
					閉じる
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Template Selector Modal -->
{#if showTemplateSelector}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-themed-surface border border-themed-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-themed-border">
				<h2 class="text-lg font-semibold text-white">テンプレート選択</h2>
				<button on:click={() => showTemplateSelector = false} class="text-themed-text-secondary hover:text-white" aria-label="Close">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="p-3">
				{#if templates.length === 0}
					<p class="text-sm text-themed-text-muted py-4 text-center">テンプレートがありません</p>
				{:else}
					<div class="space-y-2 max-h-60 overflow-y-auto">
						{#each templates as template}
							<button
								on:click={() => { selectedTemplateId = template.id; showTemplateSelector = false; }}
								class="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm transition-colors {selectedTemplateId === template.id ? 'bg-emerald-600/20 border border-emerald-500/50 text-emerald-400' : 'bg-themed-elevated text-themed-text-secondary hover:bg-themed-border/50'}"
							>
								<span class="text-lg">📝</span>
								<span class="flex-1 text-left truncate">{template.name}</span>
								{#if selectedTemplateId === template.id}
									<svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="p-3 border-t border-themed-border flex gap-2">
				<button
					on:click={() => { showTemplateSelector = false; openTemplateEditor(); }}
					class="btn-secondary flex-1"
				>
					+ 新規作成
				</button>
				<button on:click={() => showTemplateSelector = false} class="btn-primary flex-1">
					閉じる
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Model Selector Modal -->
{#if showModelSelector}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" on:click={cancelModelSelection}>
		<div class="bg-themed-surface border border-themed-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" on:click|stopPropagation>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-themed-border">
				<h2 class="text-lg font-semibold text-white">AIモデル選択</h2>
				<button on:click={cancelModelSelection} class="text-themed-text-secondary hover:text-white" aria-label="Close">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- モードタブ -->
			<div class="p-3 border-b border-themed-border">
				<div class="flex items-center gap-1 p-1 bg-themed-elevated rounded-lg">
					<button
						on:click={() => { enableImageGen = false; }}
						class="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-md text-sm transition-colors {!enableImageGen ? 'bg-primary-600 text-white' : 'text-themed-text-secondary hover:text-themed-text'}"
					>
						<span>💬</span> テキスト生成
					</button>
					<button
						on:click={() => { enableImageGen = true; selectedSearch = 'none'; }}
						class="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-md text-sm transition-colors {enableImageGen ? 'bg-pink-600 text-white' : 'text-themed-text-secondary hover:text-themed-text'}"
					>
						<span>🎨</span> 画像生成
					</button>
				</div>
			</div>

			<!-- Content -->
			<div class="p-3 max-h-[50vh] overflow-y-auto">
				{#if enableImageGen}
					<!-- 画像生成モデル -->
					<div class="space-y-2">
						{#each imageModels as model}
							<button
								on:click={() => { selectedImageModel = model.id; showModelSelector = false; }}
								class="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm transition-colors {selectedImageModel === model.id ? 'bg-pink-600/20 border border-pink-500/50 text-pink-400' : 'bg-themed-elevated text-themed-text-secondary hover:bg-themed-border/50'}"
							>
								<span class="text-lg">🖼️</span>
								<span class="flex-1 text-left truncate">{model.name}</span>
								<span class="text-xs opacity-75">{model.desc}</span>
								<span class="px-2 py-0.5 text-xs bg-pink-600/30 text-pink-400 rounded">{model.cost}</span>
							</button>
						{/each}
					</div>
				{:else}
					<!-- テキスト生成モデル -->
					<div class="space-y-2">
						{#each getModels() as model}
							<button
								on:click={() => selectModel(model.id)}
								class="flex items-center gap-2 w-full px-3 py-3 rounded-lg text-sm transition-colors {selectedModel === model.id ? 'bg-primary-600/20 border border-primary-500/50 text-primary-400' : 'bg-themed-elevated text-themed-text-secondary hover:bg-themed-border/50'}"
							>
								<span class="text-lg">{model.icon}</span>
								<div class="flex-1 text-left min-w-0">
									<div class="font-medium truncate flex items-center gap-1.5">
										{model.name}
										{#if model.isNew}
											<span class="px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded animate-pulse">NEW</span>
										{/if}
									</div>
									<div class="flex items-center gap-1 mt-0.5 flex-wrap">
										<span class="px-1.5 py-0.5 text-xs bg-blue-600/30 text-blue-400 rounded">{model.contextLength}</span>
										{#if model.reasoning}
											<span class="px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-400 rounded">推論</span>
										{/if}
										<span class="px-1.5 py-0.5 text-xs bg-green-600/30 text-green-400 rounded">{calcDailyConversations(model)}</span>
									</div>
								</div>
								{#if selectedModel === model.id}
									<svg class="w-5 h-5 text-primary-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="p-3 border-t border-themed-border">
				<button on:click={cancelModelSelection} class="w-full px-4 py-2 rounded-lg text-sm bg-themed-elevated text-themed-text-secondary hover:bg-themed-border transition-colors">
					キャンセル
				</button>
			</div>
		</div>
	</div>
{/if}
