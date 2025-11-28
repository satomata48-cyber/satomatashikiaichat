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
export async function searchWeb(query: string, apiKey: string, maxResults: number = 5): Promise<SearchResult[]> {
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
				max_results: maxResults
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

function buildSystemMessage(searchResults?: SearchResult[], customSystemPrompt?: string): string {
	// カスタムシステムプロンプト（テンプレート）がある場合
	const basePrompt = customSystemPrompt || 'あなたは親切で知識豊富なAIアシスタントです。日本語で丁寧に回答してください。';

	if (searchResults && searchResults.length > 0) {
		return `${basePrompt}

以下の検索結果を参考にして回答してください。

重要：回答にはURLやソースへの参照を含めないでください。ソースは別途システムが表示します。本文のみを回答してください。

検索結果:
${searchResults.map((r, i) => `[${i + 1}] ${r.title}\n${r.content}`).join('\n\n')}`;
	}
	return basePrompt;
}

// Together AI Chat
export async function chatWithTogetherAI(
	messages: ChatMessage[],
	apiKey: string,
	model: string = 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
	searchResults?: SearchResult[],
	systemPrompt?: string
): Promise<ReadableStream<Uint8Array>> {
	const fullMessages: ChatMessage[] = [
		{ role: 'system', content: buildSystemMessage(searchResults, systemPrompt) },
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
	searchResults?: SearchResult[],
	systemPrompt?: string
): Promise<ReadableStream<Uint8Array>> {
	const fullMessages: ChatMessage[] = [
		{ role: 'system', content: buildSystemMessage(searchResults, systemPrompt) },
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
	searchResults?: SearchResult[],
	systemPrompt?: string
): Promise<ReadableStream<Uint8Array>> {
	if (provider === 'openrouter') {
		return chatWithOpenRouter(messages, apiKey, model, searchResults, systemPrompt);
	}
	return chatWithTogetherAI(messages, apiKey, model, searchResults, systemPrompt);
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
	let inThinkTag = false; // Track if we're inside <think> tags
	let thinkBuffer = ''; // Buffer for think content

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

							// Regular content - parse <think> tags
							let content = delta?.content;
							if (content) {
								// Process content for <think> tags
								let processedContent = '';
								let i = 0;

								while (i < content.length) {
									if (!inThinkTag) {
										// Look for <think> opening tag
										const thinkStart = content.indexOf('<think>', i);
										if (thinkStart !== -1 && thinkStart === i) {
											inThinkTag = true;
											i += 7; // Skip past <think>
										} else if (thinkStart !== -1) {
											// Output content before <think>
											processedContent += content.substring(i, thinkStart);
											inThinkTag = true;
											i = thinkStart + 7;
										} else {
											// No <think> tag, output rest of content
											processedContent += content.substring(i);
											break;
										}
									} else {
										// Inside think tag, look for </think>
										const thinkEnd = content.indexOf('</think>', i);
										if (thinkEnd !== -1) {
											// Found closing tag
											const thinkContent = content.substring(i, thinkEnd);
											thinkBuffer += thinkContent;
											if (thinkBuffer) {
												yield { type: 'reasoning', text: thinkBuffer };
												thinkBuffer = '';
											}
											inThinkTag = false;
											i = thinkEnd + 9; // Skip past </think>
										} else {
											// No closing tag yet, buffer the content
											thinkBuffer += content.substring(i);
											break;
										}
									}
								}

								// Yield buffered think content periodically
								if (inThinkTag && thinkBuffer.length > 0) {
									yield { type: 'reasoning', text: thinkBuffer };
									thinkBuffer = '';
								}

								// Yield processed content
								if (processedContent) {
									yield { type: 'content', text: processedContent };
								}
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
		'deepseek-ai/DeepSeek-R1-0528-tput',
		'deepseek/deepseek-r1',
		'moonshotai/kimi-k2-thinking',
		'moonshotai/Kimi-K2-Thinking',
		'Qwen/Qwen3-Next-80B-A3B-Thinking',
		'qwen/qwen3-next-80b-a3b-thinking',
		'qwen/qwq-32b',
	];
	return reasoningModels.some(m => model.toLowerCase().includes(m.toLowerCase().split('/').pop() || ''));
}
