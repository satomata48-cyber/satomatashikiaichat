export interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export interface SearchResult {
	title: string;
	url: string;
	content: string;
}

// Tavily Search
export async function searchWeb(query: string, apiKey: string): Promise<SearchResult[]> {
	try {
		const response = await fetch('https://api.tavily.com/search', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				api_key: apiKey,
				query,
				search_depth: 'basic',
				max_results: 5
			})
		});

		if (!response.ok) {
			console.error('Tavily search error:', response.status);
			return [];
		}

		const data = await response.json() as { results: Array<{ title: string; url: string; content: string }> };
		return data.results.map((r) => ({
			title: r.title,
			url: r.url,
			content: r.content
		}));
	} catch (error) {
		console.error('Tavily search error:', error);
		return [];
	}
}

function buildSystemMessage(searchResults?: SearchResult[]): string {
	if (searchResults && searchResults.length > 0) {
		return `あなたは親切で知識豊富なAIアシスタントです。以下の検索結果を参考にして回答してください。

重要：回答にはURLやソースへの参照を含めないでください。ソースは別途システムが表示します。本文のみを回答してください。

検索結果:
${searchResults.map((r, i) => `[${i + 1}] ${r.title}\n${r.content}`).join('\n\n')}`;
	}
	return 'あなたは親切で知識豊富なAIアシスタントです。日本語で丁寧に回答してください。';
}

// Together AI Chat
export async function chatWithTogetherAI(
	messages: ChatMessage[],
	apiKey: string,
	model: string = 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
	searchResults?: SearchResult[]
): Promise<ReadableStream<Uint8Array>> {
	const fullMessages: ChatMessage[] = [
		{ role: 'system', content: buildSystemMessage(searchResults) },
		...messages
	];

	const response = await fetch('https://api.together.xyz/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model,
			messages: fullMessages,
			stream: true,
			max_tokens: 4096,
			temperature: 0.7
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Together AI error: ${response.status} - ${error}`);
	}

	return response.body!;
}

// OpenRouter Chat
export async function chatWithOpenRouter(
	messages: ChatMessage[],
	apiKey: string,
	model: string = 'google/gemini-2.5-flash-preview',
	searchResults?: SearchResult[]
): Promise<ReadableStream<Uint8Array>> {
	const fullMessages: ChatMessage[] = [
		{ role: 'system', content: buildSystemMessage(searchResults) },
		...messages
	];

	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://satomatashikiaichat.pages.dev',
			'X-Title': 'Satomata AI Chat'
		},
		body: JSON.stringify({
			model,
			messages: fullMessages,
			stream: true,
			max_tokens: 4096,
			temperature: 0.7
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenRouter error: ${response.status} - ${error}`);
	}

	return response.body!;
}

// Unified chat function
export async function chatWithAI(
	messages: ChatMessage[],
	provider: 'together' | 'openrouter',
	apiKey: string,
	model: string,
	searchResults?: SearchResult[]
): Promise<ReadableStream<Uint8Array>> {
	if (provider === 'openrouter') {
		return chatWithOpenRouter(messages, apiKey, model, searchResults);
	}
	return chatWithTogetherAI(messages, apiKey, model, searchResults);
}

// Chunk type for streaming with reasoning support
export interface StreamChunk {
	type: 'content' | 'reasoning';
	text: string;
}

// Parse SSE stream (works for both Together AI and OpenRouter)
export async function* parseSSEStreamGenerator(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						return;
					}
					if (data) {
						try {
							const json = JSON.parse(data);
							const content = json.choices?.[0]?.delta?.content;
							if (content) {
								yield content;
							}
						} catch {
							// Skip invalid JSON
						}
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

// Parse SSE stream with reasoning support for DeepSeek R1, Kimi K2, etc.
export async function* parseSSEStreamWithReasoningGenerator(stream: ReadableStream<Uint8Array>): AsyncGenerator<StreamChunk> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						return;
					}
					if (data) {
						try {
							const json = JSON.parse(data);
							const delta = json.choices?.[0]?.delta;

							// Check for reasoning_content (OpenRouter/DeepSeek format)
							const reasoning = delta?.reasoning_content || delta?.reasoning;
							if (reasoning) {
								yield { type: 'reasoning', text: reasoning };
							}

							// Regular content
							const content = delta?.content;
							if (content) {
								yield { type: 'content', text: content };
							}
						} catch {
							// Skip invalid JSON
						}
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

// Check if model supports reasoning
export function isReasoningModel(model: string): boolean {
	const reasoningModels = [
		'deepseek-ai/DeepSeek-R1',
		'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
		'deepseek/deepseek-r1',
		'moonshotai/kimi-k2',
		'moonshotai/Kimi-K2-Instruct',
	];
	return reasoningModels.some(m => model.toLowerCase().includes(m.toLowerCase().split('/').pop() || ''));
}
