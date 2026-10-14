export type WallAiProvider = 'openai' | 'firebase-gemini' | 'anthropic';
export const WALL_AI_PROVIDERS = [
  { id: 'openai', label: 'ChatGPT · OpenAI' },
  { id: 'firebase-gemini', label: 'Gemini · Google' },
  { id: 'anthropic', label: 'Claude · Anthropic' },
] as const;
export function isWallAiProvider(value: unknown): value is WallAiProvider {
  return WALL_AI_PROVIDERS.some(item => item.id === value);
}
export const wallAiProvider: WallAiProvider = isWallAiProvider(import.meta.env?.VITE_WALL_AI_PROVIDER)
  ? import.meta.env.VITE_WALL_AI_PROVIDER : 'openai';
export const wallAiProviderLabel = (provider: WallAiProvider) => WALL_AI_PROVIDERS.find(item => item.id === provider)!.label;
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
function browserStorage(): PreferenceStorage | undefined {
  try { return typeof window !== 'undefined' ? window.localStorage : undefined; } catch { return undefined; }
}
const preferenceKey = (uid: string) => 'learning-wall-ai-provider:' + encodeURIComponent(uid);
export function readWallAiProvider(uid: string, storage = browserStorage()): WallAiProvider {
  if (!uid) return wallAiProvider;
  try {
    const saved = storage?.getItem(preferenceKey(uid));
    return isWallAiProvider(saved) ? saved : wallAiProvider;
  } catch { return wallAiProvider; }
}
export function rememberWallAiProvider(uid: string, provider: WallAiProvider, storage = browserStorage()): void {
  if (!uid || !isWallAiProvider(provider)) return;
  try { storage?.setItem(preferenceKey(uid), provider); } catch { /* Choice still applies in the open panel. */ }
}
