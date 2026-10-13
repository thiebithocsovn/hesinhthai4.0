import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const MINIMUM_TEACHER_PASSWORD_LENGTH = 8;

export function validateTeacherCredentials(
  email: string,
  password: string,
  confirmation: string,
): string {
  if (!email.trim()) return 'Vui lòng nhập email của giáo viên.';
  if (password.length < MINIMUM_TEACHER_PASSWORD_LENGTH) {
    return 'Mật khẩu giáo viên phải có ít nhất 8 ký tự.';
  }
  if (password !== confirmation) return 'Mật khẩu xác nhận chưa trùng khớp.';
  return '';
}

export function describeTeacherAccountError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'Email này đã có tài khoản. Hãy sử dụng email khác hoặc đặt lại mật khẩu.',
    'auth/invalid-email': 'Email giáo viên chưa đúng định dạng.',
    'auth/operation-not-allowed': 'Firebase chưa bật phương thức đăng nhập Email/Mật khẩu.',
    'auth/weak-password': 'Mật khẩu giáo viên chưa đủ mạnh.',
    'auth/network-request-failed': 'Không thể kết nối Firebase. Vui lòng kiểm tra mạng và thử lại.',
    'permission-denied': 'Tài khoản hiện tại chưa có quyền cấp hồ sơ giáo viên.',
  };
  return messages[code] || (error instanceof Error ? error.message : 'Không thể cấp tài khoản giáo viên.');
}

export async function provisionTeacherAccount(
  email: string,
  password: string,
  saveProfile: (userId: string) => Promise<void>,
): Promise<string> {
  const temporaryApp = initializeApp(
    firebaseConfig,
    `teacher-provisioning-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const temporaryAuth = getAuth(temporaryApp);
  let createdUser: User | null = null;

  try {
    await setPersistence(temporaryAuth, inMemoryPersistence);
    const credential = await createUserWithEmailAndPassword(
      temporaryAuth,
      email.trim().toLowerCase(),
      password,
    );
    createdUser = credential.user;
    await saveProfile(createdUser.uid);
    return createdUser.uid;
  } catch (error) {
    if (createdUser) await deleteUser(createdUser).catch(() => undefined);
    throw error;
  } finally {
    await signOut(temporaryAuth).catch(() => undefined);
    await deleteApp(temporaryApp).catch(() => undefined);
  }
}
