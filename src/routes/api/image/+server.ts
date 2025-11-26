import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createChat, createMessage, recordUsage } from '$lib/server/db';

interface ImageGenerationRequest {
	prompt: string;
	model?: string;
	provider?: 'together' | 'openrouter';
	width?: number;
	height?: number;
	steps?: number;
	conversationId?: string;
}

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { prompt, model, provider = 'together', width = 1024, height = 1024, steps = 4, conversationId }: ImageGenerationRequest = await request.json();

	if (!prompt) {
		return json({ error: 'Prompt is required' }, { status: 400 });
	}

	const db = platform?.env?.DB;
	const r2 = platform?.env?.IMAGES;

	try {
		const apiKey = platform?.env?.TOGETHER_API_KEY;
		if (!apiKey) {
			return json({ error: 'Together API key not configured' }, { status: 500 });
		}

		const selectedModel = model || 'black-forest-labs/FLUX.1-schnell-Free';

		const response = await fetch('https://api.together.xyz/v1/images/generations', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: selectedModel,
				prompt,
				width,
				height,
				steps,
				n: 1,
				response_format: 'b64_json'
			})
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('Together AI image error:', error);
			return json({ error: 'Image generation failed' }, { status: response.status });
		}

		const data = await response.json();
		const imageData = data.data?.[0]?.b64_json;

		if (!imageData) {
			return json({ error: 'No image generated' }, { status: 500 });
		}

		// R2に画像を保存
		let imageUrl = `data:image/png;base64,${imageData}`;
		let chatId = conversationId;
		let imageCount = 0;

		if (r2 && db) {
			try {
				// 画像をR2に保存
				const imageId = crypto.randomUUID();
				const imageKey = `${locals.user.id}/${imageId}.png`;
				const imageBuffer = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));

				await r2.put(imageKey, imageBuffer, {
					httpMetadata: {
						contentType: 'image/png'
					}
				});

				// R2のURLを生成（公開アクセス用のAPIエンドポイントを使用）
				imageUrl = `/api/image/${imageKey}`;

				// 新しいチャットを作成（conversationIdがない場合）
				if (!chatId) {
					const title = prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt;
					const chat = await createChat(db, locals.user.id, `🎨 ${title}`);
					chatId = chat.id;
				}

				// ユーザーメッセージを保存
				await createMessage(db, chatId, 'user', `[画像生成] ${prompt}`);

				// 使用履歴を記録
				await recordUsage(db, locals.user.id, 'image');

				// アシスタントメッセージを保存（画像URLを含む）
				await createMessage(db, chatId, 'assistant', `![生成画像](${imageUrl})\n\nモデル: ${selectedModel}`);

				// ユーザーの画像数をカウント
				const countResult = await db
					.prepare(`SELECT COUNT(*) as count FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?) AND content LIKE '%/api/image/%'`)
					.bind(locals.user.id)
					.first<{ count: number }>();
				imageCount = countResult?.count || 0;

			} catch (r2Error) {
				console.error('R2 storage error:', r2Error);
				// R2エラーの場合はbase64で返す
			}
		}

		return json({
			image: imageUrl,
			model: selectedModel,
			conversationId: chatId,
			imageCount,
			warning: imageCount > 500 ? `画像が${imageCount}枚保存されています。ストレージ容量にご注意ください。` : null
		});

	} catch (error) {
		console.error('Image generation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
