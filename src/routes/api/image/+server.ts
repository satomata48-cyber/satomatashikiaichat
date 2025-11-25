import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface ImageGenerationRequest {
	prompt: string;
	model?: string;
	provider?: 'together' | 'openrouter';
	width?: number;
	height?: number;
	steps?: number;
}

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { prompt, model, provider = 'together', width = 1024, height = 1024, steps = 4 }: ImageGenerationRequest = await request.json();

	if (!prompt) {
		return json({ error: 'Prompt is required' }, { status: 400 });
	}

	try {
		if (provider === 'together') {
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

			return json({
				image: `data:image/png;base64,${imageData}`,
				model: selectedModel
			});

		} else if (provider === 'openrouter') {
			const apiKey = platform?.env?.OPENROUTER_API_KEY;
			if (!apiKey) {
				return json({ error: 'OpenRouter API key not configured' }, { status: 500 });
			}

			// OpenRouterは画像生成をサポートしていない場合があるので、Together AIにフォールバック
			const togetherKey = platform?.env?.TOGETHER_API_KEY;
			if (!togetherKey) {
				return json({ error: 'Image generation not available for OpenRouter' }, { status: 400 });
			}

			const selectedModel = 'black-forest-labs/FLUX.1-schnell-Free';

			const response = await fetch('https://api.together.xyz/v1/images/generations', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${togetherKey}`,
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
				console.error('Image generation error:', error);
				return json({ error: 'Image generation failed' }, { status: response.status });
			}

			const data = await response.json();
			const imageData = data.data?.[0]?.b64_json;

			if (!imageData) {
				return json({ error: 'No image generated' }, { status: 500 });
			}

			return json({
				image: `data:image/png;base64,${imageData}`,
				model: selectedModel
			});
		}

		return json({ error: 'Invalid provider' }, { status: 400 });

	} catch (error) {
		console.error('Image generation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
