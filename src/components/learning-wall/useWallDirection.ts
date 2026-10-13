import { useState } from 'react';

export type WallDirection = 'horizontal' | 'vertical';

// View preferences belong to the viewer, account and board on this device.
export function useWallDirection(ownerUid: string, scope: string) {
  const key = `learning-wall-direction::${ownerUid || 'guest'}::${scope}`;
  const [preferences, setPreferences] = useState<Partial<Record<string, WallDirection>>>({});
  let direction = preferences[key];
  if (!direction) {
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'horizontal' || saved === 'vertical') direction = saved;
    } catch { /* The view still works when browser storage is disabled. */ }
  }
  const changeDirection = (value: WallDirection) => {
    setPreferences(previous => ({ ...previous, [key]: value }));
    try { localStorage.setItem(key, value); } catch { /* Keep the choice for this session. */ }
  };
  return [direction, changeDirection] as const;
}
