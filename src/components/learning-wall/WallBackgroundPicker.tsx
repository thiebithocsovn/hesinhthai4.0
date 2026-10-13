import React, { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus } from 'lucide-react';
import { WALL_BACKGROUNDS, type WallCategory } from '../../lib/learningWall';
import { readWallBackground, safeBackgroundColor, wallBackgroundStyle, type WallAppearance } from '../../lib/learningWallBackground';

interface Props {
  value: Partial<WallAppearance>;
  onChange: (patch: Partial<WallCategory>) => void;
  onUploading: (uploading: boolean) => void;
}
export default function WallBackgroundPicker({ value, onChange, onUploading }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const upload = async (file?: File) => {
    if (!file || uploading) return;
    setUploading(true); onUploading(true); setError('');
    try {
      const image = await readWallBackground(file);
      if (mounted.current) onChange({ bgType: 'image', bgValue: image });
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Không đọc được ảnh nền.'); }
    finally { if (mounted.current) { setUploading(false); onUploading(false); if (fileRef.current) fileRef.current.value = ''; } }
  };
  return <div className="lw-background-picker">
    <div className="lw-background-preview" style={wallBackgroundStyle(value)} aria-label="Xem trước nền"><div><strong>Tên lớp của thầy</strong><span>Bài làm của học sinh sẽ hiển thị trên nền này.</span></div></div>
    <fieldset><legend>Nền có sẵn</legend><div className="lw-background-presets">{WALL_BACKGROUNDS.map(item => <button type="button" key={item.id} disabled={uploading} aria-pressed={!value.bgValue && value.wallBackground === item.id} onClick={() => { setError(''); onChange({ wallBackground: item.id, bgType: 'color', bgValue: '' }); }}><span style={wallBackgroundStyle({ wallBackground: item.id })}>{!value.bgValue && value.wallBackground === item.id && <Check size={18} />}</span>{item.label}</button>)}</div></fieldset>
    <label className="lw-background-color">Màu riêng<input type="color" aria-label="Chọn màu nền riêng" disabled={uploading} value={safeBackgroundColor(value.bgValue) || '#e2ebdf'} onChange={event => { setError(''); onChange({ bgType: 'color', bgValue: event.target.value }); }} /></label>
    <input ref={fileRef} className="lw-background-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Chọn ảnh nền từ máy" onChange={event => void upload(event.target.files?.[0])} hidden />
    <button type="button" className="lw-button" disabled={uploading} onClick={() => fileRef.current?.click()}><ImagePlus size={18} />{uploading ? 'Đang xử lý ảnh…' : 'Tải ảnh nền từ máy'}</button>
    <p className="lw-help">Ảnh JPG, PNG, WebP tối đa 12 MB; ảnh được nén trước khi lưu. Nền được lưu cho lớp và áp dụng cả trên liên kết chia sẻ.</p>
    {error && <p className="lw-inline-error" role="alert">{error}</p>}
    <button type="button" className="lw-button" disabled={uploading} onClick={() => { setError(''); onChange({ wallBackground: 'sage', bgType: 'color', bgValue: '' }); }}>Khôi phục nền mặc định</button>
  </div>;
}
