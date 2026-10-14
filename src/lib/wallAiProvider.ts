export const wallAiProvider = import.meta.env?.VITE_WALL_AI_PROVIDER === 'firebase-gemini' ? 'firebase-gemini' : 'openai';
export const wallAiLabel = wallAiProvider === 'openai' ? 'GPT · OpenAI' : 'Gemini · Firebase';
