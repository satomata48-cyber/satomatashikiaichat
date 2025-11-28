import type { RequestHandler } from './$types';
import { searchWeb, chatWithAI, parseSSEStreamGenerator, parseSSEStreamWithReasoningGenerator, isReasoningModel } from '$lib/server/ai';
import { createMessage, getMessagesByChat, createChat, getChatById, recordUsage } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!platform?.env?.DB) {
		return new Response(JSON.stringify({ error: 'Database not available' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const env = platform.env as Record<string, string>;
	const togetherApiKey = env.TOGETHER_API_KEY;
	const openrouterApiKey = env.OPENROUTER_API_KEY;
	const tavilyApiKey = env.TAVILY_API_KEY;

	const { message, conversationId, enableSearch, searchResultCount = 5, model, provider = 'together', systemPrompt, dateTime } = await request.json();

	// Get the correct API key based on provider
	const apiKey = provider === 'openrouter' ? openrouterApiKey : togetherApiKey;

	if (!apiKey) {
		return new Response(JSON.stringify({ error: `${provider} API key not configured` }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!message) {
		return new Response(JSON.stringify({ error: 'Message is required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	let chatId = conversationId;

	// Create new chat if needed
	if (!chatId) {
		const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
		const chat = await createChat(platform.env.DB, locals.user.id, title);
		chatId = chat.id;
	} else {
		// Verify chat belongs to user
		const chat = await getChatById(platform.env.DB, chatId);
		if (!chat || chat.user_id !== locals.user.id) {
			return new Response(JSON.stringify({ error: 'Chat not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	// Save user message
	await createMessage(platform.env.DB, chatId, 'user', message);

	// Record usage history
	await recordUsage(platform.env.DB, locals.user.id, 'message');

	// Get chat history
	const messages = await getMessagesByChat(platform.env.DB, chatId);
	const chatHistory = messages.map(m => ({
		role: m.role as 'user' | 'assistant' | 'system',
		content: m.content
	}));

	// Search if enabled
	let searchResults = undefined;
	if (enableSearch && tavilyApiKey) {
		searchResults = await searchWeb(message, tavilyApiKey, searchResultCount);
	}

	try {
		// Get AI response stream
		let aiStream;
		try {
			// 日時情報をシステムプロンプトに追加
		let finalSystemPrompt = systemPrompt || '';
		if (dateTime) {
			const dateTimeInfo = `現在の日時（日本時間）: ${dateTime}`;
			finalSystemPrompt = finalSystemPrompt
				? `${dateTimeInfo}\n\n${finalSystemPrompt}`
				: dateTimeInfo;
		}
		aiStream = await chatWithAI(chatHistory, provider, apiKey, model, searchResults, finalSystemPrompt || undefined);
		} catch (aiError) {
			console.error('AI API error:', aiError);
			return new Response(JSON.stringify({ error: `AI API error: ${aiError instanceof Error ? aiError.message : 'Unknown error'}` }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		const useReasoning = isReasoningModel(model);

		// Collect full response for saving
		let fullResponse = '';
		let fullReasoning = '';

		const responseStream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();

				// Send chat ID first
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ conversationId: chatId })}\n\n`));

				// Send search results if any
				if (searchResults && searchResults.length > 0) {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sources: searchResults })}\n\n`));
				}

				try {
					if (useReasoning) {
						// Use reasoning-aware stream parser
						for await (const chunk of parseSSEStreamWithReasoningGenerator(aiStream)) {
							if (chunk.type === 'reasoning') {
								fullReasoning += chunk.text;
								controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoning: chunk.text })}\n\n`));
							} else if (chunk.type === 'content') {
								fullResponse += chunk.text;
								controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk.text })}\n\n`));
							}
						}
					} else {
						// Use standard stream parser
						for await (const content of parseSSEStreamGenerator(aiStream)) {
							fullResponse += content;
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
						}
					}

					// Save assistant message
					if (fullResponse) {
						await createMessage(
							platform.env.DB,
							chatId,
							'assistant',
							fullResponse,
							searchResults ? JSON.stringify(searchResults) : undefined,
							fullReasoning || undefined,
							model
						);
					}

					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
					controller.close();
				} catch (error) {
					console.error('Stream error:', error);
					const errorMsg = error instanceof Error ? error.message : 'Stream processing error';
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`));
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
					controller.close();
				}
			}
		});

		return new Response(responseStream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive'
			}
		});
	} catch (error) {
		console.error('Chat error:', error);
		return new Response(JSON.stringify({ error: 'Failed to get AI response' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
