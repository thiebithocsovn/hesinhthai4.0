import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, addDoc, query, serverTimestamp, doc, updateDoc, where, getDocs, getDocFromServer, setDoc, writeBatch, runTransaction, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Teacher } from '../types';
import { isPlickerSystemCategory } from '../lib/plickerLive';
import { canAccessTeacherOwnedRecord, filterTeacherOwnedRecords, isValidTeacherUid, resolveTeacherAccessScope } from '../lib/teacherIsolation';
import { WALL_POST_COLORS, assertWallSize, boardPosts, canSubmitToSharedWall, createWallLink, newWallShareId, readWallShareId, safeWallAttachment, safeWallImage, safeWallUrl, sharedWallPost, submissionPostAttachments, wallSubmissionData, validWallLocation, wallBackground, wallErrorMessage as errorMessage, wallLayout, type SharedWall, type WallCategory, type WallPost, type WallSubmission } from '../lib/learningWall';
import { normalizeWallAppearance, readSharedWallAppearance, sharedWallAppearance, WALL_APPEARANCE_ID, type WallAppearance } from '../lib/learningWallBackground';
import WallBoardSurface, { type WallBoardActions } from './learning-wall/WallBoardSurface';
import { prepareWallAssessmentSave, wallWorkRevision } from '../lib/learningWallAssessment';
import { prepareWallChatSave } from '../lib/learningWallChat';

interface Props { onBack: () => void; currentUser?: Teacher | 'admin' | null; onLogin?: () => void }
function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  return online;
}
function sharedSettings(board: WallCategory, categories: WallCategory[], permission: 'read' | 'write', enabled: boolean): SharedWall {
  const sections = [{ id: board.id, title: 'Bài chung' }, ...categories.filter(item => item.parentId === board.id && item.authorId === board.authorId && (!item.ownerUid || item.ownerUid === board.authorId)).map(item => ({ id: item.id, title: item.title }))];
  if (sections.length > 40) throw new Error('Một bảng chia sẻ hỗ trợ tối đa 39 cột và mục Bài chung.');
  return { authorId: board.authorId!, title: board.title, description: board.wallDescription || '', icon: board.wallIcon || '📚', layout: wallLayout(board.wallLayout), background: wallBackground(board.wallBackground).id, sections, sectionIds: sections.map(item => item.id), enabled, permission };
}

function publishAppearance(batch: ReturnType<typeof writeBatch>, token: string, board: WallCategory) {
  const ref = doc(db, 'shared_learning_walls', token, 'posts', WALL_APPEARANCE_ID);
  const appearance = sharedWallAppearance(board);
  if (appearance) batch.set(ref, appearance); else batch.delete(ref);
}

function PrivateLearningWall({ onBack, currentUser, onLogin }: Props) {
  const accessScope = resolveTeacherAccessScope(currentUser, auth.currentUser?.uid);
  const [categories, setCategories] = useState<WallCategory[]>([]);
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [openedClassId, setOpenedClassId] = useState<string | null>(null);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [postsReady, setPostsReady] = useState(false);
  const [error, setError] = useState('');
  const [share, setShare] = useState<SharedWall | null>(null);
  const [submissions, setSubmissions] = useState<WallSubmission[]>([]);
  const online = useOnline();
  const ownerUid = accessScope.ownerUid;
  const displayName = currentUser === 'admin' ? 'Quản trị viên' : currentUser?.name || 'Giáo viên';
  const board = categories.find(item => item.id === openedClassId);
  const currentBoardPosts = useMemo(() => board ? boardPosts(board, categories, posts) : [], [board, categories, posts]);

  useEffect(() => { if (board?.wallDeleted) setOpenedClassId(null); }, [board?.wallDeleted]);

  useEffect(() => {
    setCategories([]); setOpenedClassId(null); setCategoriesReady(false); setError('');
    if (accessScope.role === 'guest') return;
    const categoriesQuery = accessScope.role === 'administrator' ? collection(db, 'categories') : query(collection(db, 'categories'), where('authorId', '==', accessScope.ownerUid));
    return onSnapshot(categoriesQuery, snapshot => {
      setCategories(filterTeacherOwnedRecords(accessScope, snapshot.docs.filter(item => !isPlickerSystemCategory(item.id, item.data())).map(item => ({ ...item.data(), id: item.id } as WallCategory))));
      setCategoriesReady(true);
    }, reason => { setCategories([]); setCategoriesReady(true); setError(errorMessage(reason)); });
  }, [ownerUid, accessScope.role]);
  useEffect(() => {
    setPosts([]); setPostsReady(false);
    if (accessScope.role === 'guest') return;
    const postsQuery = accessScope.role === 'administrator' ? collection(db, 'wall_posts') : query(collection(db, 'wall_posts'), where('authorId', '==', accessScope.ownerUid));
    return onSnapshot(postsQuery, snapshot => {
      setPosts(snapshot.docs.filter(item => item.data().kind !== 'plicker_report' && canAccessTeacherOwnedRecord(accessScope, item.data())).map(item => ({ ...item.data(), id: item.id } as WallPost)));
      setPostsReady(true);
    }, reason => { setPosts([]); setPostsReady(true); setError(errorMessage(reason)); });
  }, [ownerUid, accessScope.role]);
  useEffect(() => {
    setShare(null); setSubmissions([]);
    if (!board?.wallShareId || accessScope.role === 'guest') return;
    const ref = doc(db, 'shared_learning_walls', board.wallShareId);
    const stopShare = onSnapshot(ref, snapshot => setShare(snapshot.exists() ? snapshot.data() as SharedWall : null), reason => setError(errorMessage(reason)));
    const stopInbox = onSnapshot(query(collection(ref, 'submissions'), orderBy('createdAt', 'asc'), limit(100)), snapshot => setSubmissions(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as WallSubmission))), reason => setError(errorMessage(reason)));
    return () => { stopShare(); stopInbox(); };
  }, [board?.id, board?.wallShareId, ownerUid, accessScope.role]);

  const assertOwner = (record?: WallCategory | WallPost) => {
    if (!online) throw new Error('Hãy kết nối lại mạng trước khi lưu. Nội dung đang soạn vẫn được giữ trong cửa sổ này.');
    if (auth.currentUser?.uid !== ownerUid || accessScope.role === 'guest') throw new Error('Phiên đăng nhập đã thay đổi. Hãy mở lại Tường Học tập Ai.');
    if (record && (!canAccessTeacherOwnedRecord(accessScope, record) || !isValidTeacherUid(record.authorId))) throw new Error('Không có quyền thay đổi dữ liệu này.');
  };
  const shareRef = () => board?.wallShareId ? doc(db, 'shared_learning_walls', board.wallShareId) : null;
  const actions: WallBoardActions = {
    async emptyTrash(targets) {
      assertOwner();
      for (const target of targets) {
        assertOwner(target);
        const rootRef = doc(db, 'categories', target.id);
        const latest = await getDocFromServer(rootRef);
        if (!latest.exists()) continue;
        const root = { ...latest.data(), id: target.id } as WallCategory;
        assertOwner(root);
        if (!root.wallDeleted || root.parentId) throw new Error('Bảng đã được khôi phục. Hãy tải lại thùng rác.');
        // Read fresh data; a dashboard snapshot may still be loading.
        const children = await getDocs(query(collection(db, 'categories'), where('parentId', '==', root.id)));
        const ownChildren = children.docs.filter(item => item.data().authorId === root.authorId);
        const refs = [];
        for (const id of [root.id, ...ownChildren.map(item => item.id)]) {
          const work = await getDocs(query(collection(db, 'wall_posts'), where('categoryId', '==', id)));
          for (const item of work.docs) { if (item.data().authorId === root.authorId) { assertOwner({ ...item.data(), id: item.id } as WallPost); refs.push(item.ref); } }
        }
        if (root.wallShareId) {
          const publishedRef = doc(db, 'shared_learning_walls', root.wallShareId);
          const published = await getDocFromServer(publishedRef);
          if (published.exists()) {
            if (published.data().authorId !== root.authorId) throw new Error('Dữ liệu chia sẻ không thuộc bảng này.');
            await updateDoc(publishedRef, { enabled: false, updatedAt: serverTimestamp() });
            for (const name of ['posts', 'submissions']) {
              const items = await getDocs(collection(publishedRef, name));
              refs.push(...items.docs.map(item => item.ref));
            }
            refs.push(publishedRef);
          }
        }
        // Keep the root until the very end so failed cleanup can be retried.
        refs.push(...ownChildren.map(item => item.ref));
        for (let offset = 0; offset < refs.length; offset += 400) {
          assertOwner(root);
          const batch = writeBatch(db);
          refs.slice(offset, offset + 400).forEach(ref => batch.delete(ref));
          await batch.commit();
        }
        const batch = writeBatch(db); batch.delete(rootRef); await batch.commit();
      }
    },
    async createBoard(input) {
      assertOwner(); const title = input.title?.trim(); if (!title) throw new Error('Vui lòng nhập tên bảng.');
      const ref = await addDoc(collection(db, 'categories'), { title: title.slice(0, 180), authorId: ownerUid, ownerUid, author: displayName, parentId: null, wallIcon: (input.wallIcon || '📚').slice(0, 8), wallDescription: (input.wallDescription || '').slice(0, 2000), wallLayout: wallLayout(input.wallLayout), wallBackground: wallBackground(input.wallBackground).id, ...normalizeWallAppearance(input), createdAt: serverTimestamp() });
      setOpenedClassId(ref.id);
    },
    async updateBoard(target, input) {
      assertOwner(target); const patch: Record<string, unknown> = {};
      if (input.title !== undefined) { if (!input.title.trim()) throw new Error('Tên bảng không được để trống.'); patch.title = input.title.trim().slice(0, 180); }
      if (input.wallDescription !== undefined) patch.wallDescription = input.wallDescription.slice(0, 2000);
      if (input.wallIcon !== undefined) patch.wallIcon = input.wallIcon.slice(0, 8);
      if (input.wallLayout !== undefined) patch.wallLayout = wallLayout(input.wallLayout);
      if (input.wallBackground !== undefined) patch.wallBackground = wallBackground(input.wallBackground).id;
      if (input.bgType !== undefined || input.bgValue !== undefined) Object.assign(patch, normalizeWallAppearance({ ...target, ...input }));
      for (const key of ['wallArchived', 'wallDeleted', 'wallComments', 'wallReactions'] as const) if (input[key] !== undefined) patch[key] = Boolean(input[key]);
      const batch = writeBatch(db); batch.update(doc(db, 'categories', target.id), patch);
      if (target.wallShareId && input.wallDeleted === true) {
        // Close sharing atomically, including deletion from the dashboard where no share listener is active.
        const publishedRef = doc(db, 'shared_learning_walls', target.wallShareId);
        const published = await getDocFromServer(publishedRef);
        if (published.exists()) batch.update(publishedRef, { enabled: false, updatedAt: serverTimestamp() });
      } else if (target.wallShareId && board?.id === target.id) {
        const publishedRef = doc(db, 'shared_learning_walls', target.wallShareId);
        const published = share || (await getDocFromServer(publishedRef)).data() as SharedWall | undefined;
        if (published) {
          const next = { ...target, ...patch } as WallCategory;
          batch.set(publishedRef, { ...sharedSettings(next, categories, published.permission, next.wallArchived || next.wallDeleted ? false : published.enabled), updatedAt: serverTimestamp() });
          if (input.bgType !== undefined || input.bgValue !== undefined || input.wallBackground !== undefined) publishAppearance(batch, target.wallShareId, next);
        }
      }
      await batch.commit();
    },
    async createSection(target, title) {
      if (target.wallDeleted) throw new Error('Hãy khôi phục bảng trước khi thêm cột.');
      assertOwner(target); const ref = doc(collection(db, 'categories'));
      const section: WallCategory = { id: ref.id, title: title.slice(0, 180), parentId: target.id, authorId: target.authorId, ownerUid: target.authorId, author: target.author || displayName };
      const { id, ...data } = section; const batch = writeBatch(db); batch.set(ref, { ...data, createdAt: serverTimestamp() });
      if (target.wallShareId && share) batch.set(doc(db, 'shared_learning_walls', target.wallShareId), { ...sharedSettings(target, [...categories, section], share.permission, share.enabled), updatedAt: serverTimestamp() });
      await batch.commit();
    },
    async renameSection(section, title) {
      assertOwner(section); const batch = writeBatch(db); batch.update(doc(db, 'categories', section.id), { title: title.slice(0, 180) });
      if (board?.wallShareId && share) batch.set(shareRef()!, { ...sharedSettings(board, categories.map(item => item.id === section.id ? { ...item, title: title.slice(0, 180) } : item), share.permission, share.enabled), updatedAt: serverTimestamp() });
      await batch.commit();
    },
    async savePost(target, input, existing) {
      if (target.wallDeleted) throw new Error('Hãy khôi phục bảng trước khi đăng bài.');
      assertOwner(target); if (existing) assertOwner(existing);
      if (target.wallArchived) throw new Error('Hãy khôi phục bảng trước khi đăng bài.');
      const selectedCategoryId = input.categoryId || existing?.categoryId || target.id;
      const selectedCategory = categories.find(category => category.id === selectedCategoryId);
      if (!selectedCategory || !canAccessTeacherOwnedRecord(accessScope, selectedCategory) || selectedCategory.authorId !== target.authorId || (selectedCategory.id !== target.id && selectedCategory.parentId !== target.id)) throw new Error('Cột nhận bài không thuộc bảng của giáo viên này.');
      if (existing && !currentBoardPosts.some(post => post.id === existing.id)) throw new Error('Bài đăng không thuộc bảng đang mở.');
      const merged = { ...existing, ...input };
      const post = {
        categoryId: selectedCategoryId, boardId: target.id, authorId: target.authorId!, teacherId: target.authorId!,
        studentName: (merged.studentName || displayName).trim().slice(0, 120), title: (merged.title || '').trim().slice(0, 200), text: (merged.text || '').trim().slice(0, 12000),
        imageSrc: safeWallImage(merged.imageSrc), attachments: (merged.attachments || []).filter(item => safeWallAttachment(item)).slice(0, 4),
        color: WALL_POST_COLORS.includes(merged.color || '') ? merged.color : '#ffffff', pinned: Boolean(merged.pinned),
        ...(merged.position ? { position: { x: Math.max(0, Math.min(3000, Number(merged.position.x) || 0)), y: Math.max(0, Math.min(5000, Number(merged.position.y) || 0)) } } : {}),
        ...(merged.location && validWallLocation(merged.location.lat, merged.location.lng) ? { location: { ...merged.location, label: merged.location.label.slice(0, 180) } } : {}),
      };
      if (!post.studentName || (!post.title && !post.text && !post.imageSrc && !post.attachments.length)) throw new Error('Bài đăng cần tên và nội dung.');
      assertWallSize(post);
      const ref = existing ? doc(db, 'wall_posts', existing.id) : doc(collection(db, 'wall_posts')); const batch = writeBatch(db);
      if (existing) batch.update(ref, post); else batch.set(ref, { ...post, createdAt: serverTimestamp(), comments: [], likes: 0, likedBy: [] });
      if (target.wallShareId && share?.enabled) batch.set(doc(shareRef()!, 'posts', ref.id), sharedWallPost({ ...post, id: ref.id, createdAt: existing?.createdAt || Date.now() }));
      await batch.commit();
    },
    async removePost(post) { assertOwner(post); const batch = writeBatch(db); batch.delete(doc(db, 'wall_posts', post.id)); if (board?.wallShareId) batch.delete(doc(shareRef()!, 'posts', post.id)); await batch.commit(); },
    async react(post) {
      assertOwner(post); await runTransaction(db, async transaction => {
        const ref = doc(db, 'wall_posts', post.id); const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new Error('Bài đăng đã bị xóa.');
        const likes = new Set<string>(snapshot.data().likedBy || []); if (likes.has(ownerUid)) likes.delete(ownerUid); else likes.add(ownerUid); transaction.update(ref, { likedBy: [...likes] });
      });
    },
    async comment(post, text) {
      assertOwner(post); await runTransaction(db, async transaction => {
        const ref = doc(db, 'wall_posts', post.id); const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new Error('Bài đăng đã bị xóa.');
        const comments = snapshot.data().comments || []; if (comments.length >= 100) throw new Error('Bài đã có 100 nhận xét.');
        const next = [...comments, { id: crypto.randomUUID(), text: text.slice(0, 2000), authorName: displayName, createdAt: Date.now() }]; assertWallSize({ ...snapshot.data(), comments: next }); transaction.update(ref, { comments: next });
      });
    },
    async grade(post, score) {
      assertOwner(post);
      if (!Number.isFinite(score) || score < 0 || score > 10) throw new Error('Điểm phải nằm trong khoảng 0–10.');
      await runTransaction(db, async transaction => {
        const ref = doc(db, 'wall_posts', post.id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('Bài đăng đã bị xóa.');
        assertOwner({ ...snapshot.data(), id: post.id } as WallPost);
        const assessment = snapshot.data().aiAssessment;
        transaction.update(ref, { score, ...(assessment?.review.status === 'approved' ? {
          aiAssessment: { ...assessment, review: { ...assessment.review, score, teacherUid: ownerUid, teacherName: displayName, reviewedAt: Date.now() } },
        } : {}) });
      });
    },
    async saveAiChat(post, input, expected) {
      assertOwner(post);
      if (!board || !currentBoardPosts.some(item => item.id === post.id)) throw new Error('Bài làm không thuộc bảng đang mở.');
      return runTransaction(db, async transaction => {
        const ref = doc(db, 'wall_posts', post.id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('Bài đăng đã bị xóa.');
        const latest = { ...snapshot.data(), id: post.id } as WallPost;
        assertOwner(latest);
        if (latest.categoryId !== post.categoryId || latest.boardId !== post.boardId) throw new Error('Bài đã chuyển bảng hoặc cột. Hãy mở lại bài.');
        if (await wallWorkRevision(latest) !== input.workRevision) throw new Error('Bài làm đã thay đổi. Bắt đầu cuộc trao đổi mới trước khi lưu.');
        const patch = prepareWallChatSave(latest, input, expected);
        assertOwner(latest); transaction.update(ref, patch); return patch.aiChat;
      });
    },
    async saveAssessment(post, input, expected, approve = false) {
      assertOwner(post);
      if (!board || !currentBoardPosts.some(item => item.id === post.id)) throw new Error('Bài làm không thuộc bảng đang mở.');
      return runTransaction(db, async transaction => {
        const ref = doc(db, 'wall_posts', post.id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('Bài đăng đã bị xóa.');
        const latest = { ...snapshot.data(), id: post.id } as WallPost;
        assertOwner(latest);
        if (latest.categoryId !== post.categoryId || latest.boardId !== post.boardId) throw new Error('Bài đã chuyển bảng hoặc cột. Hãy mở lại bài.');
        if (await wallWorkRevision(latest) !== input.workRevision) throw new Error('Nội dung bài làm đã thay đổi. Hãy mở lại và phân tích bài mới trước khi lưu.');
        const { next, patch } = prepareWallAssessmentSave(latest, input, expected, ownerUid, displayName, approve);
        assertOwner(latest);
        transaction.update(ref, patch);
        return next;
      });
    },
    async share(target, permission) {
      assertOwner(target); if (target.wallArchived || target.wallDeleted) throw new Error('Hãy khôi phục bảng trước khi chia sẻ.');
      const token = target.wallShareId || newWallShareId(); const ref = doc(db, 'shared_learning_walls', token);
      if (target.wallShareId) {
        const published = await getDocFromServer(ref);
        if (published.exists() && published.data().enabled === true) {
          // Changing submission mode keeps the link readable and its guest listeners alive.
          const batch = writeBatch(db);
          batch.update(ref, { ...sharedSettings(target, categories, permission, true), updatedAt: serverTimestamp() });
          publishAppearance(batch, token, target);
          await batch.commit();
          setError('');
          return;
        }
      }
      const sourcePosts = boardPosts(target, categories, posts); if (sourcePosts.length > 150) throw new Error('Một bảng chia sẻ tối đa 150 bài. Hãy chia nội dung thành các bảng nhỏ hơn.');
      // Disable before uploading; readers never see a partly refreshed publication.
      await setDoc(ref, { ...sharedSettings(target, categories, permission, false), updatedAt: serverTimestamp() });
      const old = await getDocs(collection(ref, 'posts')); const keep = new Set(sourcePosts.map(post => post.id));
      const appearance = sharedWallAppearance(target);
      if (appearance) keep.add(WALL_APPEARANCE_ID);
      let batch = writeBatch(db), bytes = 0, operations = 0;
      const flush = async () => { if (operations) { await batch.commit(); batch = writeBatch(db); operations = 0; bytes = 0; } };
      for (const post of sourcePosts) {
        const safe = sharedWallPost(post); const size = new TextEncoder().encode(JSON.stringify(safe)).length;
        if (bytes + size > 2_000_000 || operations >= 30) await flush(); batch.set(doc(ref, 'posts', post.id), safe); bytes += size; operations += 1;
      }
      if (appearance) {
        const size = new TextEncoder().encode(JSON.stringify(appearance)).length;
        if (bytes + size > 2_000_000 || operations >= 30) await flush();
        batch.set(doc(ref, 'posts', WALL_APPEARANCE_ID), appearance); bytes += size; operations += 1;
      }
      for (const item of old.docs) if (!keep.has(item.id)) { if (operations >= 30) await flush(); batch.delete(item.ref); operations += 1; }
      await flush(); const finish = writeBatch(db); finish.update(ref, { enabled: true, updatedAt: serverTimestamp() }); finish.update(doc(db, 'categories', target.id), { wallShareId: token }); await finish.commit(); setError('');
    },
    async revoke(target) { assertOwner(target); if (target.wallShareId) await updateDoc(doc(db, 'shared_learning_walls', target.wallShareId), { enabled: false, updatedAt: serverTimestamp() }); },
    async review(submission, approve) {
      if (!board?.wallShareId) throw new Error('Hãy mở đúng bảng nhận bài.'); assertOwner(board);
      const section = categories.find(item => item.id === submission.categoryId);
      if (approve && (!section || section.authorId !== board.authorId || (section.id !== board.id && section.parentId !== board.id))) throw new Error('Cột nhận bài đã thay đổi. Hãy kiểm tra lại trước khi duyệt.');
      await runTransaction(db, async transaction => {
        const inboxRef = doc(shareRef()!, 'submissions', submission.id); const snapshot = await transaction.get(inboxRef); if (!snapshot.exists()) throw new Error('Bài này đã được xử lý.');
        if (approve) {
          const value = snapshot.data() as WallSubmission; const id = `shared-${submission.id}`;
          const post: WallPost = { id, categoryId: value.categoryId, boardId: board.id, authorId: board.authorId, teacherId: board.authorId, title: value.title, text: value.text, studentName: value.studentName, imageSrc: safeWallImage(value.imageSrc), attachments: submissionPostAttachments(value), color: '#ffffff', createdAt: Date.now(), comments: [], likes: 0, likedBy: [] };
          const { id: ignored, ...data } = post; assertWallSize(data); transaction.set(doc(db, 'wall_posts', id), { ...data, createdAt: serverTimestamp() }); transaction.set(doc(shareRef()!, 'posts', id), sharedWallPost(post));
        }
        transaction.delete(inboxRef);
      });
    },
  };
  // Keep guest gating explicit: a link opens a separate, redacted collection below.
  return <>{accessScope.role !== 'guest' && (
    <WallBoardSurface categories={categories} posts={posts} boardId={openedClassId} onOpen={setOpenedClassId} onBack={onBack} displayName={displayName} ownerUid={ownerUid} administrator={accessScope.role === 'administrator'} loading={!categoriesReady || !postsReady} error={error} offline={!online} actions={actions} submissions={submissions} sharePermission={share?.permission} shareUrl={board?.wallShareId && share?.enabled ? createWallLink(import.meta.env.BASE_URL, window.location.origin, board.wallShareId) : ''} />
  )}{accessScope.role === 'guest' && <div className="lw-app"><div className="lw-main"><div className="lw-empty"><h1>Tường Học tập Ai</h1><p>Đăng nhập tài khoản giáo viên để tạo và quản lý bảng. Học sinh mở liên kết chia sẻ do giáo viên cung cấp.</p>{onLogin && <button className="lw-button lw-primary" onClick={onLogin}>Đăng nhập giáo viên</button>}<button className="lw-button" onClick={onBack}>Về trang chủ</button></div></div></div>}</>;
}

function SharedLearningWall({ token, onBack }: { token: string; onBack: () => void }) {
  const [shared, setShared] = useState<SharedWall | null>(null);
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [appearance, setAppearance] = useState<Partial<WallAppearance>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const online = useOnline(); const lastSubmit = useRef(0);
  useEffect(() => {
    setShared(null); setPosts([]); setAppearance({}); setLoading(true); setReady(false); setError('');
    return onSnapshot(doc(db, 'shared_learning_walls', token), snapshot => {
      if (!snapshot.exists() || !snapshot.data().enabled) { setShared(null); setError('Liên kết đã tắt hoặc không còn tồn tại.'); }
      else { setShared(snapshot.data() as SharedWall); setError(''); } setLoading(false);
    }, () => { setShared(null); setPosts([]); setAppearance({}); setLoading(false); setError('Không mở được bảng. Liên kết có thể đã được tắt hoặc chưa sẵn sàng.'); });
  }, [token]);
  useEffect(() => {
    setPosts([]); setAppearance({}); setReady(false); if (!shared?.enabled) return;
    return onSnapshot(collection(db, 'shared_learning_walls', token, 'posts'), snapshot => {
      const records = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as WallPost));
      setAppearance(readSharedWallAppearance(records.find(item => item.id === WALL_APPEARANCE_ID), shared.sectionIds[0]));
      setPosts(records.filter(item => item.id !== WALL_APPEARANCE_ID)); setReady(true);
    }, () => { setPosts([]); setAppearance({}); setReady(true); setError('Không đọc được bài đăng; có thể giáo viên đã tắt chia sẻ.'); });
  }, [token, shared?.enabled]);
  const unavailable = async () => { throw new Error('Chỉ giáo viên quản lý bảng mới được thực hiện thao tác này.'); };
  const actions: WallBoardActions = {
    emptyTrash: unavailable, createBoard: unavailable, updateBoard: unavailable, createSection: unavailable, renameSection: unavailable, removePost: unavailable, react: unavailable, comment: unavailable, grade: unavailable, saveAssessment: unavailable, saveAiChat: unavailable, share: unavailable, revoke: unavailable, review: unavailable,
    async savePost(target, input) {
      if (!online) throw new Error('Hãy kết nối lại mạng trước khi gửi bài.');
      if (!canSubmitToSharedWall(shared)) throw new Error('Giáo viên chưa mở nhận bài.');
      if (Date.now() - lastSubmit.current < 10_000) throw new Error('Hãy chờ ít giây trước khi gửi bài tiếp theo.');
      if (!input.categoryId || !shared.sectionIds.includes(input.categoryId)) throw new Error('Cột nhận bài chưa hợp lệ.');
      const data = wallSubmissionData(input);
      try { await addDoc(collection(db, 'shared_learning_walls', token, 'submissions'), { ...data, createdAt: serverTimestamp() }); lastSubmit.current = Date.now(); } catch (error) {
        if ('attachments' in data && String((error as { code?: string })?.code).includes('permission-denied')) throw new Error('Chưa gửi được tệp. Giáo viên có thể đã tắt nhận bài hoặc chưa cập nhật quyền nhận tệp trên Firebase. Tệp vẫn được giữ trong cửa sổ này.');
        throw new Error(errorMessage(error, true));
      }
    },
  };
  if (!shared) return <div className="lw-app"><div className="lw-main"><div className="lw-empty"><h1>Tường Học tập Ai</h1><p role={error ? 'alert' : 'status'}>{loading ? 'Đang mở bảng được chia sẻ…' : error}</p><button className="lw-button" onClick={onBack}>Về trang chủ</button></div></div></div>;
  const rootId = shared.sectionIds[0];
  const categories: WallCategory[] = [{ id: rootId, title: shared.title, wallDescription: shared.description, wallIcon: shared.icon, wallLayout: wallLayout(shared.layout), wallBackground: shared.background, ...appearance }, ...shared.sections.filter(item => item.id !== rootId).map(item => ({ ...item, parentId: rootId }))];
  return <WallBoardSurface categories={categories} posts={posts} boardId={rootId} onOpen={() => undefined} onBack={onBack} displayName="Công khai" ownerUid="" guest guestCanPost={canSubmitToSharedWall(shared)} loading={!ready} error={error} offline={!online} actions={actions} />;
}

export default function LearningWall(props: Props) {
  const [token, setToken] = useState(() => readWallShareId(window.location.hash));
  useEffect(() => { const update = () => setToken(readWallShareId(window.location.hash)); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  const back = () => { if (token) window.history.replaceState(null, '', import.meta.env.BASE_URL); setToken(''); props.onBack(); };
  return token ? <SharedLearningWall token={token} onBack={back} /> : <PrivateLearningWall {...props} onBack={back} />;
}
