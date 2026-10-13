const ADMIN_ALIAS = 'admin';
const ADMIN_EMAIL_SESSION_KEY = 'smartclass_verified_admin_email_v1';

export function isAdministratorAlias(value: string): boolean {
  return value.trim().toLowerCase() === ADMIN_ALIAS;
}

export function readRememberedAdministratorEmail(): string {
  if (typeof window === 'undefined') return '';

  try {
    return (window.sessionStorage.getItem(ADMIN_EMAIL_SESSION_KEY) || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

export function rememberVerifiedAdministratorEmail(email: string): void {
  if (typeof window === 'undefined') return;

  try {
    const normalized = email.trim().toLowerCase();
    if (normalized) window.sessionStorage.setItem(ADMIN_EMAIL_SESSION_KEY, normalized);
  } catch {
    // Restricted browser storage must not prevent a valid administrator login.
  }
}

export function resolveAdministratorLoginEmail(
  loginId: string,
  options: { configuredEmail?: string; rememberedEmail?: string } = {},
): string {
  const identifier = loginId.trim();
  if (!isAdministratorAlias(identifier)) return identifier;

  return (
    options.configuredEmail ||
    options.rememberedEmail ||
    ''
  ).trim().toLowerCase();
}
