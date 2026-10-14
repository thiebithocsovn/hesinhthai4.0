import React from 'react';
import { LogIn } from 'lucide-react';
import { WALL_AI_PROVIDERS, type WallAiProvider } from '../../lib/wallAiProvider';

export interface WallGoogleLogin {
  onLogin: () => void;
  busy: boolean;
  pending: boolean;
  message: string;
  onCancel: () => void;
}
export function WallGoogleConnect({ login, disabled = false }: { login: WallGoogleLogin; disabled?: boolean }) {
  return <div className="lw-ai-google">
    <div className="lw-row lw-ai-wrap"><button type="button" className="lw-button" disabled={disabled || login.busy} onClick={login.onLogin}><LogIn size={17} />{login.busy ? 'Đang đăng nhập Google…' : 'Đăng nhập bằng Google'}</button>
      {login.pending && <button type="button" className="lw-button" onClick={login.onCancel}>Hủy đăng nhập Google</button>}</div>
    {login.message && <p role="status" className="lw-help">{login.message}</p>}
  </div>;
}
export default function WallAiProviderPicker({ provider, onChange, disabled, googleLogin }: {
  provider: WallAiProvider; onChange: (provider: WallAiProvider) => void; disabled: boolean; googleLogin?: WallGoogleLogin;
}) {
  return <div className="lw-ai-provider">
    <label>Chọn AI cho bài làm<select aria-label="Chọn AI cho bài làm" value={provider} disabled={disabled || googleLogin?.busy} onChange={event => onChange(event.target.value as WallAiProvider)}>
      {WALL_AI_PROVIDERS.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
    </select></label>
    {googleLogin && <WallGoogleConnect login={googleLogin} disabled={disabled} />}
    <p className="lw-help">Google xác thực tài khoản giáo viên. Mỗi AI cần được kết nối trước khi dùng; đăng nhập Google chưa xác nhận kết nối AI.</p>
    <p className="lw-help">Khi bấm gửi, nội dung bài và lịch sử trao đổi liên quan sẽ được gửi tới AI đã chọn. Giáo viên kiểm tra nhận xét và quyết định điểm.</p>
  </div>;
}
