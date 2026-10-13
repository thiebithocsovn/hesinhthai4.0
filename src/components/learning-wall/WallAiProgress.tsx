import React, { useMemo, useState } from 'react';
import { Download, TrendingUp } from 'lucide-react';
import type { WallPost } from '../../lib/learningWall';
import { VERDICT_LABELS, wallProgressCsv, wallProgressRows } from '../../lib/learningWallAssessment';

export function downloadWallText(content: string, filename: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function WallAiProgress({ posts, onOpenPost, compact = false }: {
  posts: WallPost[]; onOpenPost?: (id: string) => void; compact?: boolean;
}) {
  const [search, setSearch] = useState('');
  const all = useMemo(() => wallProgressRows(posts), [posts]);
  const rows = all.filter(row => `${row.studentName} ${row.studentCode} ${row.skill}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  return <section className={compact ? 'lw-ai-progress' : 'lw-form lw-ai-progress'}>
    <div className="lw-ai-heading"><TrendingUp size={20} /><h3>Theo dõi khắc phục lỗi</h3></div>
    <p className="lw-help">Số liệu từ phân tích đã duyệt và bài luyện tập đã được giáo viên đánh giá. Mã học sinh do giáo viên xác minh nối các bài trong cùng bảng; tên tự khai chưa có mã được theo dõi riêng từng bài.</p>
    <div className="lw-ai-stats" aria-label="Thống kê tiến bộ">
      <div><strong>{all.length}</strong><span>Kỹ năng cần theo dõi</span></div>
      <div><strong>{all.filter(row => row.verdict === 'resolved').length}</strong><span>Đã khắc phục</span></div>
      <div><strong>{all.reduce((sum, row) => sum + row.attempts, 0)}</strong><span>Lượt luyện tập đã kiểm tra</span></div>
    </div>
    {!compact && <div className="lw-row lw-ai-wrap"><input aria-label="Tìm học sinh hoặc kỹ năng" placeholder="Tìm học sinh, mã hoặc kỹ năng…" value={search} onChange={event => setSearch(event.target.value)} /><button type="button" className="lw-button" disabled={!all.length} onClick={() => downloadWallText(wallProgressCsv(posts), 'Tien_bo_hoc_sinh.csv', 'text/csv;charset=utf-8')}><Download size={16} />Xuất báo cáo CSV</button></div>}
    {!rows.length ? <p className="lw-ai-empty">{all.length ? 'Không có kết quả phù hợp.' : 'Chưa có dữ liệu đã duyệt. Phân tích bài làm, xác nhận lỗi, giao luyện tập và ghi kết quả để bắt đầu theo dõi.'}</p> : <div className="lw-ai-table-scroll"><table className="lw-ai-table"><thead><tr><th>Học sinh</th><th>Kỹ năng</th><th>Lượt</th><th>Kết quả mới nhất</th><th>Cập nhật</th>{onOpenPost && <th>Bài làm</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.key}>
      <td><strong>{row.studentName}</strong><small>{row.studentCode || 'Chưa nối mã học sinh'}</small></td><td>{row.skill}</td><td>{row.attempts}</td><td><span className={`lw-ai-status is-${row.verdict}`}>{row.verdict === 'unassessed' ? 'Chưa đánh giá' : VERDICT_LABELS[row.verdict]}</span></td><td>{new Date(row.updatedAt).toLocaleDateString('vi-VN')}</td>{onOpenPost && <td><button type="button" className="lw-button" onClick={() => onOpenPost(row.postId)}>Xem bài</button></td>}
    </tr>)}</tbody></table></div>}
    <p className="lw-help">“Đã khắc phục” cần lượt đánh giá mới nhất của tất cả bài luyện tập cho kỹ năng đó đều đạt. Đây là bằng chứng từ các bài đã kiểm tra.</p>
  </section>;
}
