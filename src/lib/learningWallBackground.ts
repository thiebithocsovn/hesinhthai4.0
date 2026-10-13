import { readWallFile, sharedWallPost, wallBackground, type WallCategory, type WallPost } from './learningWall';

export const WALL_APPEARANCE_ID = 'wall-board-background';
export const MAX_BACKGROUND_LENGTH = 480_000;
export type WallAppearance = Pick<WallCategory, 'bgType' | 'bgValue' | 'wallBackground'>;

export function safeBackgroundColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '';
}
export function safeBackgroundImage(value: unknown): string {
  return typeof value === 'string' && value.length <= MAX_BACKGROUND_LENGTH &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : '';
}
export function normalizeWallAppearance(input: Partial<WallAppearance>): Pick<WallCategory, 'bgType' | 'bgValue'> {
  if (!input.bgValue) return { bgType: 'color', bgValue: '' };
  const value = input.bgType === 'image' ? safeBackgroundImage(input.bgValue) : safeBackgroundColor(input.bgValue);
  if (!value) throw new Error('Nền chưa hợp lệ. Hãy chọn màu hoặc tải ảnh JPG, PNG, WebP.');
  return { bgType: input.bgType === 'image' ? 'image' : 'color', bgValue: value };
}
export function wallBackgroundStyle(board?: Partial<WallAppearance>, softenImage = true) {
  const preset = wallBackground(board?.wallBackground);
  const image = board?.bgType === 'image' ? safeBackgroundImage(board.bgValue) : '';
  const color = board?.bgType === 'color' ? safeBackgroundColor(board.bgValue) : '';
  return {
    backgroundColor: color || preset.color,
    backgroundImage: image ? `${softenImage ? 'linear-gradient(#ffffff88, #ffffff88), ' : ''}url("${image}")` : color ? 'none' : preset.pattern,
    backgroundSize: image || color || !preset.pattern.startsWith('radial') ? 'cover' : '18px 18px',
    backgroundPosition: 'center',
  };
}
export async function readWallBackground(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Chọn ảnh JPG, PNG hoặc WebP.');
  const attachment = await readWallFile(file);
  const value = safeBackgroundImage(attachment.url);
  if (!value) throw new Error('Ảnh nền còn quá lớn. Hãy chọn ảnh nhỏ hơn.');
  return value;
}

// Reserved public media record uses the existing redacted image schema. It is
// never a student post, so readers exclude its ID before counting or displaying.
// This keeps photo backgrounds compatible with the deployed Firestore rules.
export function sharedWallAppearance(board: WallCategory) {
  const image = board.bgType === 'image' ? safeBackgroundImage(board.bgValue) : '';
  const color = board.bgType === 'color' ? safeBackgroundColor(board.bgValue) : '';
  if (!image && !color) return null;
  return sharedWallPost({ id: WALL_APPEARANCE_ID, categoryId: board.id, studentName: '', title: '', text: color, imageSrc: image, color: '#ffffff', createdAt: 0, pinned: false });
}
export function readSharedWallAppearance(value: Partial<WallPost> | undefined, boardId: string): Partial<WallAppearance> {
  if (!value || value.id !== WALL_APPEARANCE_ID || value.categoryId !== boardId) return {};
  const image = safeBackgroundImage(value.imageSrc);
  if (image) return { bgType: 'image', bgValue: image };
  const color = safeBackgroundColor(value.text);
  return color ? { bgType: 'color', bgValue: color } : {};
}
