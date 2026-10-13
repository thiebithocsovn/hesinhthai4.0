import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import WallBoardSurface from '../../src/components/learning-wall/WallBoardSurface';
import { prepareWallAssessmentSave, wallWorkRevision } from '../../src/lib/learningWallAssessment';
import type { WallPost } from '../../src/lib/learningWall';
const initial: WallPost = { id: 'work-one', authorId: 'teacher-one', teacherId: 'teacher-one', boardId: 'class-8a', categoryId: 'class-8a', studentName: 'Học sinh thử nghiệm', title: 'Sơ đồ an toàn số', text: 'Lừa đảo -> chia sẻ mật khẩu để nhận thưởng.', color: '#fff', createdAt: Date.now() };
function Harness() {
  const [post, setPost] = useState<WallPost>(initial);
  const guest = new URLSearchParams(location.search).has('guest');
  const no = async () => {};
  return <WallBoardSurface categories={[{ id: 'class-8a', title: 'Lớp 8A', authorId: 'teacher-one', wallLayout: 'grid', wallDescription: 'Phân biệt các nguy cơ truy cập website không phù hợp.' }]} posts={[post]} boardId="class-8a" onOpen={no} onBack={no} displayName="Giáo viên thử nghiệm" ownerUid="teacher-one" guest={guest}
    actions={{ emptyTrash:no,createBoard:no,updateBoard:no,createSection:no,renameSection:no,savePost:no,removePost:no,react:no,comment:no,grade:no,share:no,revoke:no,review:no,
      saveAssessment: async (target, next, expected, approve) => {
        if (await wallWorkRevision(post) !== next.workRevision) throw new Error('Stale work');
        const saved = prepareWallAssessmentSave(post, next, expected, 'teacher-one', 'Giáo viên thử nghiệm', approve);
        setPost({ ...post, ...saved.patch }); (window as any).saved = { ...post, ...saved.patch }; return saved.next;
      },
    }} />;
}
createRoot(document.getElementById('root')!).render(<Harness />);
