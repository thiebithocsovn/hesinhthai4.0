import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function publicationKey(secret: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(secret)) throw new Error('Publication secret is unavailable.');
  return Buffer.from(secret, 'hex');
}
export function createPublicationToken(uid: string, secret: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) throw new Error('Invalid owner identity.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', publicationKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ uid, key: 'p' + randomBytes(16).toString('hex') }), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function decodePublicationToken(token: string, secret: string): { uid: string; key: string } {
  if (!/^[A-Za-z0-9_-]{60,500}$/.test(token)) throw new Error('Invalid publication link.');
  const bytes = Buffer.from(token, 'base64url'), decipher = createDecipheriv('aes-256-gcm', publicationKey(secret), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(data.uid) || !/^p[a-f0-9]{32}$/.test(data.key)) throw new Error('Invalid publication link.');
  return data;
}
