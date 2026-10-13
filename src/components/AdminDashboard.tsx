import React, { lazy, useState, useRef, useEffect, useMemo } from 'react';
import { Users, Plus, Trash2, Key, LogOut, Search, Edit2, ShieldCheck, BookOpen, CheckCircle, Lock, Unlock, Library, Gift, Target, QrCode, Camera, X, LayoutDashboard, FolderPlus, UserPlus, Star, ArrowLeft, MoreVertical, Clock, Bookmark, Globe, Filter, MessageCircle, CheckSquare, ChevronUp, ChevronDown, Settings, ClipboardCheck, MonitorPlay, MessageSquare, Hand, FileSpreadsheet, FileText, Eye, EyeOff } from 'lucide-react';
import { Teacher } from '../types';
import { doc, setDoc, deleteDoc, updateDoc, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, arrayUnion, where } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../firebase';
import { ECOSYSTEM_APPLICATIONS } from '../ecosystem';
import { describeTeacherAccountError, MINIMUM_TEACHER_PASSWORD_LENGTH, provisionTeacherAccount, validateTeacherCredentials } from '../lib/teacherAccounts';
import { assignPlickerCardIds, filterPlickerStudentsByClasses, removePlickerStudent, renamePlickerStudent } from '../lib/plickerStudents';
import { isPlickerSystemCategory, mergePlickerCloudRosters, type PlickerLiveQuestionSet } from '../lib/plickerLive';
import type { PlickerClassroomReport } from '../lib/plickerReports';
import {
  canAccessTeacherOwnedRecord,
  createTeacherStorageKey,
  filterTeacherOwnedRecords,
  isValidTeacherUid,
  resolveTeacherAccessScope,
} from '../lib/teacherIsolation';

const LuckyDraw = lazy(() => import('./LuckyDraw'));
const PlickerScanner = lazy(() => import('./PlickerClassroom'));
const HeadShakeGame = lazy(() => import('./HeadShakeGame'));
const AIChatbot = lazy(() => import('./AIChatbot'));
const ExamManager = lazy(() => import('./ExamManager'));
const SecretBoxGame = lazy(() => import('./SecretBoxGame'));
const DragDropGame = lazy(() => import('./DragDropGame'));
const ExcelMerger = lazy(() => import('./ExcelMerger'));
const PdfMerger = lazy(() => import('./PdfMerger'));
const GestureClass = lazy(() => import('./GestureClass'));
const LearningWall = lazy(() => import('./LearningWall'));

interface CameraCaptureProps {
  onCapture: (imageSrc: string) => void;
  onClose: () => void;
}

function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function setupCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError('Không thể truy cập máy ảnh. Vui lòng kiểm tra quyền truy cập.');
      }
    }

    setupCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageSrc = canvas.toDataURL('image/jpeg');
        onCapture(imageSrc);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Chụp ảnh hồ sơ</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center">
          {error ? (
            <div className="text-red-500 mb-4">{error}</div>
          ) : (
            <div className="relative w-full aspect-video bg-slate-100 rounded-xl overflow-hidden mb-6">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex gap-3 w-full">
            <button 
              onClick={onClose}
              className="flex-1 px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button 
              onClick={handleCapture}
              disabled={!!error}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Camera className="w-5 h-5" />
              Chụp ảnh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AdminDashboardProps {
  onLogout: () => void;
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  currentUser: Teacher | 'admin' | null;
  initialApplication?: 'plicker' | null;
}

interface DashboardStudent {
  id: string;
  classId: string;
  name: string;
  email?: string;
  cardId?: number;
  teacherId?: string;
}

interface DashboardCategory {
  id: string;
  title: string;
  color?: string;
  parentId?: string;
  author?: string;
  time?: string;
  bgType?: 'color' | 'image';
  bgValue?: string;
  authorId?: string;
}

export default function AdminDashboard({ onLogout, teachers, setTeachers, currentUser, initialApplication }: AdminDashboardProps) {
  const accessScope = resolveTeacherAccessScope(currentUser, auth.currentUser?.uid);
  const currentUserId = accessScope.ownerUid;
  const currentUserName = currentUser === 'admin' ? 'Admin' : currentUser?.name;
  const studentsStorageKey = createTeacherStorageKey('students', accessScope.ownerUid);
  const [activeTab, setActiveTab] = useState<'teachers' | 'library'>(initialApplication === 'plicker' || currentUser !== 'admin' ? 'library' : 'teachers');
  const [activeLibraryView, setActiveLibraryView] = useState<'main' | 'gesture-class' | 'learning-wall' | 'lucky-draw' | 'lucky-draw-cards' | 'plicker' | 'head-shake-game' | 'chatbot' | 'create-exam' | 'secret-box' | 'drag-drop-game' | 'excel-merger' | 'pdf-merger'>(initialApplication === 'plicker' ? 'plicker' : 'main');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newTeacher, setNewTeacher] = useState<Partial<Teacher>>({
    name: '', username: '', email: '', school: '', level: 'THPT', status: 'active'
  });
  const [newTeacherPassword, setNewTeacherPassword] = useState('');
  const [newTeacherPasswordConfirmation, setNewTeacherPasswordConfirmation] = useState('');
  const [showNewTeacherPassword, setShowNewTeacherPassword] = useState(false);
  const [teacherAccountError, setTeacherAccountError] = useState('');
  const [isCreatingTeacher, setIsCreatingTeacher] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<'new' | 'edit' | 'global_post' | { type: 'category', categoryId: string } | null>(null);

  // Categories State
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [administratorCloudStudents, setAdministratorCloudStudents] = useState<DashboardStudent[]>([]);
  const [administratorQuestionSets, setAdministratorQuestionSets] = useState<(PlickerLiveQuestionSet & { teacherId: string })[]>([]);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryTitle, setEditingCategoryTitle] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryTitle, setNewCategoryTitle] = useState('');

  // Posts State
  const [posts, setPosts] = useState<{ id: string; categoryId: string; imageSrc: string; studentName: string; createdAt: string; score?: number; comments?: { id: string, text: string, createdAt: string }[]; authorId?: string; teacherId?: string; kind?: string; report?: PlickerClassroomReport }[]>([]);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [pendingPostImage, setPendingPostImage] = useState<string | null>(null);
  const [postFormData, setPostFormData] = useState({ categoryId: '', studentId: '' });
  const [activeScorePostId, setActiveScorePostId] = useState<string | null>(null);

  useEffect(() => {
    setCategories([]);
    setAdministratorCloudStudents([]);
    setAdministratorQuestionSets([]);
    setCategoriesReady(false);
    if (accessScope.role === 'guest') {
      setCategoriesReady(true);
      return;
    }

    const categoriesQuery = accessScope.role === 'administrator'
      ? collection(db, 'categories')
      : query(collection(db, 'categories'), where('authorId', '==', accessScope.ownerUid));
    const unsub = onSnapshot(categoriesQuery, (snapshot) => {
      const visibleDocuments = snapshot.docs.filter(item =>
        canAccessTeacherOwnedRecord(accessScope, item.data()));
      const visibleCategories = visibleDocuments
        .filter(item => !isPlickerSystemCategory(item.id, item.data()))
        .map(item => ({ id: item.id, ...item.data() } as DashboardCategory));
      setCategories(visibleCategories);

      if (accessScope.role === 'administrator') {
        const classOwners = new Map(visibleCategories.map(category => [category.id, category.authorId]));
        const cloudStudents = new Map<string, DashboardStudent>();
        const cloudQuestionSets = new Map<string, PlickerLiveQuestionSet & { teacherId: string }>();

        for (const item of visibleDocuments) {
          if (!isPlickerSystemCategory(item.id, item.data())) continue;
          const room = item.data();
          const teacherId = room.ownerUid;
          if (!isValidTeacherUid(teacherId) || room.authorId !== teacherId) continue;

          for (const [classId, roster] of Object.entries(room.rosters || {})) {
            if (classOwners.get(classId) !== teacherId || !Array.isArray(roster)) continue;
            for (const entry of roster) {
              if (!entry || !isValidTeacherUid(entry.id) || entry.classId !== classId ||
                  typeof entry.name !== 'string' || !entry.name.trim()) continue;
              cloudStudents.set(`${teacherId}:${classId}:${entry.id}`, {
                id: entry.id,
                classId,
                name: entry.name.trim(),
                ...(typeof entry.cardId === 'number' ? { cardId: entry.cardId } : {}),
                teacherId,
              });
            }
          }

          if (!Array.isArray(room.librarySets)) continue;
          for (const questionSet of room.librarySets) {
            if (!questionSet || !isValidTeacherUid(questionSet.id) ||
                typeof questionSet.title !== 'string' || !Array.isArray(questionSet.questions)) continue;
            cloudQuestionSets.set(`${teacherId}:${questionSet.id}`, {
              ...questionSet as PlickerLiveQuestionSet,
              id: `${teacherId}__${questionSet.id}`,
              teacherId,
            });
          }
        }

        setAdministratorCloudStudents([...cloudStudents.values()]);
        setAdministratorQuestionSets([...cloudQuestionSets.values()]);
      }
      setCategoriesReady(true);
    }, error => {
      console.error('Không thể tải dữ liệu lớp học theo tài khoản:', error);
      setCategories([]);
      setAdministratorCloudStudents([]);
      setAdministratorQuestionSets([]);
      setCategoriesReady(true);
    });
    return unsub;
  }, [accessScope.ownerUid, accessScope.role]);

  useEffect(() => {
    setPosts([]);
    if (accessScope.role === 'guest') {
      return;
    }

    const postsQuery = accessScope.role === 'administrator'
      ? collection(db, 'wall_posts')
      : query(collection(db, 'wall_posts'), where('authorId', '==', accessScope.ownerUid));
    const unsub = onSnapshot(postsQuery, (snapshot) => {
      const visiblePosts = filterTeacherOwnedRecords(accessScope, snapshot.docs
        .map(item => ({ id: item.id, ...item.data() } as {
          id: string;
          authorId?: string;
          teacherId?: string;
        })));
      setPosts(visiblePosts as typeof posts);
    }, error => {
      console.error('Không thể tải nội dung riêng của giáo viên:', error);
      setPosts([]);
    });
    return unsub;
  }, [accessScope.ownerUid, accessScope.role]);

  const handleAddCategory = async () => {
    if (newCategoryTitle.trim()) {
      try {
        await addDoc(collection(db, 'categories'), {
          title: newCategoryTitle.trim(),
          parentId: openedClassId || null,
          author: currentUserName,
          authorId: currentUserId,
          createdAt: serverTimestamp()
        });
        setNewCategoryTitle('');
        setIsAddingCategory(false);
      } catch (err) {
        console.error("Error adding category:", err);
      }
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (err) {
      console.error("Error deleting category:", err);
    }
  };

  const handleRenameCategory = async (id: string) => {
    if (editingCategoryTitle.trim()) {
      try {
        await updateDoc(doc(db, 'categories', id), {
          title: editingCategoryTitle.trim()
        });
        setEditingCategoryId(null);
        setEditingCategoryTitle('');
      } catch (err) {
        console.error("Error renaming category:", err);
      }
    }
  };

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: keyof Teacher, direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: keyof Teacher) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedTeachers = useMemo(() => {
    let sortableTeachers = [...teachers];
    if (sortConfig !== null) {
      sortableTeachers.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableTeachers;
  }, [teachers, sortConfig]);

  // Learning Wall State
  const [wallBgColor, setWallBgColor] = useState('#FFD524');
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [openedClassId, setOpenedClassId] = useState<string | null>(null);
  const [postSortBy, setPostSortBy] = useState<'createdAt' | 'score' | 'comments'>('createdAt');
  const [postSortOrder, setPostSortOrder] = useState<'asc' | 'desc'>('desc');

  // Create Class Form State
  const [newClass, setNewClass] = useState({ name: '', academicYear: '' });
  
  // Students State
  const [students, setStudents] = useState<DashboardStudent[]>(() => {
    try {
      const saved = localStorage.getItem(studentsStorageKey);
      return saved ? assignPlickerCardIds(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });
  const [excelInput, setExcelInput] = useState('');

  useEffect(() => {
    const normalized = assignPlickerCardIds(students);
    if (normalized.some((student, index) => student !== students[index])) {
      setStudents(normalized);
      return;
    }
    localStorage.setItem(studentsStorageKey, JSON.stringify(students));
  }, [students, studentsStorageKey]);

  const myCategories = useMemo(() =>
    accessScope.role === 'administrator' ? categories : categories.filter(category => category.authorId === currentUserId),
  [accessScope.role, categories, currentUserId]);
  const plickerCategories = useMemo(() =>
    myCategories.filter(category => !category.parentId),
  [myCategories]);
  const plickerStudents = useMemo(() =>
    filterPlickerStudentsByClasses(
      accessScope.role === 'administrator'
        ? [...students, ...administratorCloudStudents.filter(cloudStudent =>
          !students.some(student => student.id === cloudStudent.id && student.classId === cloudStudent.classId))]
        : students,
      plickerCategories,
    ),
  [accessScope.role, administratorCloudStudents, plickerCategories, students]);
  const synchronizedPlickerReports = useMemo(() => posts
    .filter(post => post.kind === 'plicker_report' && post.report?.id &&
      canAccessTeacherOwnedRecord(accessScope, post))
    .map(post => ({
      ...post.report!,
      teacherId: post.teacherId || post.authorId || '',
    }))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt)),
  [accessScope.ownerUid, accessScope.role, posts]);

  useEffect(() => {
    if (accessScope.role !== 'administrator' || !categoriesReady) return;

    for (const post of posts) {
      if (post.authorId || post.kind === 'plicker_report') continue;
      const ownerUid = categories.find(category => category.id === post.categoryId)?.authorId;
      if (!ownerUid || ownerUid === 'admin') continue;
      void updateDoc(doc(db, 'wall_posts', post.id), {
        authorId: ownerUid,
        teacherId: ownerUid,
      }).catch(error => console.error('Không thể khôi phục chủ sở hữu bài đăng cũ:', error));
    }
  }, [accessScope.role, categories, categoriesReady, posts]);

  useEffect(() => {
    if (!categoriesReady) return;
    setStudents(previous => filterPlickerStudentsByClasses(previous, categories));
  }, [categories, categoriesReady]);

  useEffect(() => {
    if (!categoriesReady || !accessScope.ownerUid) return;
    const migrationKey = createTeacherStorageKey('students_legacy_migrated', accessScope.ownerUid);
    if (localStorage.getItem(migrationKey) === '1') return;
    localStorage.setItem(migrationKey, '1');

    try {
      const legacyValue = localStorage.getItem('students');
      if (!legacyValue) return;
      const legacyStudents = filterPlickerStudentsByClasses(JSON.parse(legacyValue), categories);
      if (!legacyStudents.length) return;
      setStudents(previous => assignPlickerCardIds([
        ...previous,
        ...legacyStudents.filter(student => !previous.some(item => item.id === student.id)),
      ]));
    } catch (error) {
      console.error('Không thể khôi phục danh sách học sinh cũ đúng tài khoản:', error);
    }
  }, [accessScope.ownerUid, categories, categoriesReady]);

  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (newClass.name.trim()) {
      const classId = Math.random().toString(36).substr(2, 9);
      const bgColors = ['#FFC107', '#B2DFDB', '#D85A4A', '#818CF8', '#34D399'];
      const randomColor = bgColors[Math.floor(Math.random() * bgColors.length)];
      
      setCategories([...categories, { 
        id: classId, 
        title: newClass.name.trim(),
        author: currentUserName,
        authorId: currentUserId,
        time: 'Vừa xong',
        bgType: 'color',
        bgValue: randomColor
      }]);
      
      if (newClass.academicYear.trim()) {
        const lines = newClass.academicYear.split('\n').filter(line => line.trim() !== '');
        const newStudents = lines.map(line => {
          const parts = line.split('\t');
          const name = parts.length > 1 ? parts[1].trim() : parts[0].trim();
          return {
            id: Math.random().toString(36).substr(2, 9),
            classId: classId,
            name: name,
            teacherId: accessScope.ownerUid,
          };
        });
        setStudents([...students, ...newStudents]);
      }
    }
    alert('Đã tạo lớp thành công!');
    setIsCreateClassModalOpen(false);
    setNewClass({ name: '', academicYear: '' });
  };

  const handleExcelPaste = () => {
    if (!excelInput.trim() || !activeClassId) return;
    
    const lines = excelInput.split('\n').filter(line => line.trim() !== '');
    const newStudents = lines.map(line => {
      // Assuming each line is just a student name, or tab-separated values where name is the first or second column.
      // For simplicity, let's just use the whole line as the name if there are no tabs, or the first column if there are.
      const parts = line.split('\t');
      const name = parts.length > 1 ? parts[1].trim() : parts[0].trim();
      return {
        id: Math.random().toString(36).substr(2, 9),
        classId: activeClassId,
        name: name,
        teacherId: accessScope.ownerUid,
      };
    });
    
    setStudents([...students, ...newStudents]);
    setExcelInput('');
  };

  const handleDeleteStudent = (id: string) => {
    setStudents(students.filter(s => s.id !== id));
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = (newTeacher.email || '').trim().toLowerCase();
    const validationError = validateTeacherCredentials(
      email,
      newTeacherPassword,
      newTeacherPasswordConfirmation,
    );
    if (validationError) {
      setTeacherAccountError(validationError);
      return;
    }

    setTeacherAccountError('');
    setIsCreatingTeacher(true);
    try {
      await provisionTeacherAccount(email, newTeacherPassword, async userId => {
        const teacher: Teacher = {
          id: userId,
          name: (newTeacher.name || '').trim(),
          username: (newTeacher.username || '').trim(),
          email,
          school: (newTeacher.school || '').trim(),
          level: newTeacher.level || 'THPT',
          status: newTeacher.status as 'active' | 'inactive' || 'active',
        };
        if (newTeacher.avatar) teacher.avatar = newTeacher.avatar;
        await setDoc(doc(db, 'teachers', userId), teacher);
      });
      setIsAddModalOpen(false);
      setNewTeacher({ name: '', username: '', email: '', school: '', level: 'THPT', status: 'active' });
      setNewTeacherPassword('');
      setNewTeacherPasswordConfirmation('');
      setShowNewTeacherPassword(false);
      alert('Đã cấp tài khoản giáo viên thành công!');
    } catch (error) {
      console.error("Error adding teacher:", error);
      setTeacherAccountError(describeTeacherAccountError(error));
    } finally {
      setIsCreatingTeacher(false);
    }
  };

  const handleDeleteTeacher = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Xóa giáo viên',
      message: 'Bạn có chắc chắn muốn xóa giáo viên này?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'teachers', id));
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error("Error deleting teacher:", error);
        }
      }
    });
  };

  const handleResetPassword = (id: string) => {
    const teacher = teachers.find(item => item.id === id);
    if (!teacher?.email) {
      alert('Chưa có email hợp lệ để gửi hướng dẫn đặt lại mật khẩu.');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Khôi phục mật khẩu',
      message: `Gửi email đặt lại mật khẩu an toàn đến ${teacher.email}?`,
      onConfirm: async () => {
        try {
          await sendPasswordResetEmail(auth, teacher.email);
          alert('Đã gửi hướng dẫn đặt lại mật khẩu đến email của giáo viên.');
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error("Error resetting password:", error);
          alert('Có lỗi xảy ra khi đặt lại mật khẩu.');
        }
      }
    });
  };

  const handleToggleStatus = (id: string, currentStatus: 'active' | 'inactive') => {
    const action = currentStatus === 'active' ? 'khóa' : 'mở khóa';
    setConfirmDialog({
      isOpen: true,
      title: `${currentStatus === 'active' ? 'Khóa' : 'Mở khóa'} tài khoản`,
      message: `Bạn có chắc chắn muốn ${action} tài khoản giáo viên này?`,
      onConfirm: async () => {
        try {
          const teacher = teachers.find(t => t.id === id);
          if (teacher) {
            const teacherData = { ...teacher, status: currentStatus === 'active' ? 'inactive' : 'active' };
            if (teacherData.avatar === undefined) {
              delete teacherData.avatar;
            }
            await setDoc(doc(db, 'teachers', id), teacherData);
          }
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error("Error toggling teacher status:", error);
        }
      }
    });
  };

  const handleEditTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTeacher) {
      try {
        const teacherData = { ...editingTeacher };
        if (teacherData.avatar === undefined) {
          delete teacherData.avatar;
        }
        await setDoc(doc(db, 'teachers', teacherData.id), teacherData);
        setIsEditModalOpen(false);
        setEditingTeacher(null);
        alert('Đã cập nhật thông tin giáo viên thành công!');
      } catch (error) {
        console.error("Error editing teacher:", error);
      }
    }
  };

  const openEditModal = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setIsEditModalOpen(true);
  };

  const filteredTeachers = sortedTeachers.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col md:flex-row">
      {/* Mobile Header */}
      {!(activeTab === 'library' && activeLibraryView !== 'main') && (
        <header className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-500 p-1 rounded text-white">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="font-bold text-base">{currentUser === 'admin' ? 'Admin Portal' : 'Teacher Portal'}</span>
          </div>
          <button onClick={onLogout} className="p-2 text-slate-400 hover:text-white">
            <LogOut className="w-5 h-5" />
          </button>
        </header>
      )}

      {/* Sidebar */}
      {!(activeTab === 'library' && activeLibraryView !== 'main') && (
        <aside className="w-64 bg-slate-900 text-white flex flex-col hidden md:flex shrink-0">
          <div className="p-6 flex items-center gap-3 border-b border-slate-800">
            <div className="bg-indigo-500 p-1.5 rounded text-white">
              <BookOpen className="w-6 h-6" />
            </div>
            <span className="font-bold text-lg">{currentUser === 'admin' ? 'Admin Portal' : 'Teacher Portal'}</span>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            {currentUser === 'admin' && (
              <button 
                onClick={() => setActiveTab('teachers')}
                className={`flex items-center gap-3 px-4 py-3 w-full rounded-xl transition-colors ${
                  activeTab === 'teachers' 
                    ? 'bg-indigo-600 text-white' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Users className="w-5 h-5" />
                <span className="font-medium">Quản lý giáo viên</span>
              </button>
            )}
            <button 
              onClick={() => {
                setActiveTab('library');
                setActiveLibraryView('main');
              }}
              className={`flex items-center gap-3 px-4 py-3 w-full rounded-xl transition-colors ${
                activeTab === 'library' 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Library className="w-5 h-5" />
              <span className="font-medium">Thư viện tương tác</span>
            </button>
          </nav>
          <div className="p-4 border-t border-slate-800">
            <button 
              onClick={onLogout}
              className="flex items-center gap-3 px-4 py-3 w-full text-slate-400 hover:bg-slate-800 hover:text-white rounded-xl transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Đăng xuất</span>
            </button>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden pb-16 md:pb-0">
        {activeTab === 'teachers' ? (
          <>
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">Quản lý giáo viên</h1>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Tìm kiếm giáo viên..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full sm:w-64"
                  />
                </div>
                <button 
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
                >
                  <Plus className="w-5 h-5" />
                  Cấp tài khoản
                </button>
              </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 md:p-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px] md:min-w-0">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm uppercase tracking-wider">
                      <th className="px-6 py-4 font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('name')}>
                        <div className="flex items-center gap-1">
                          Họ và tên
                          {sortConfig?.key === 'name' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />) : null}
                        </div>
                      </th>
                      <th className="px-6 py-4 font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('username')}>
                        <div className="flex items-center gap-1">
                          Tên đăng nhập
                          {sortConfig?.key === 'username' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />) : null}
                        </div>
                      </th>
                      <th className="px-6 py-4 font-medium">Đơn vị công tác</th>
                      <th className="px-6 py-4 font-medium">Cấp học</th>
                      <th className="px-6 py-4 font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('status')}>
                        <div className="flex items-center gap-1">
                          Trạng thái
                          {sortConfig?.key === 'status' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />) : null}
                        </div>
                      </th>
                      <th className="px-6 py-4 font-medium text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTeachers.map((teacher) => (
                      <tr key={teacher.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{teacher.name}</div>
                          <div className="text-sm text-slate-500">{teacher.email}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{teacher.username}</td>
                        <td className="px-6 py-4 text-slate-600">{teacher.school}</td>
                        <td className="px-6 py-4 text-slate-600">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {teacher.level}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            teacher.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                          }`}>
                            {teacher.status === 'active' ? 'Hoạt động' : 'Khóa'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {teacher.status === 'inactive' ? (
                              <button 
                                onClick={() => handleToggleStatus(teacher.id, teacher.status)}
                                className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Mở khóa tài khoản"
                              >
                                <Unlock className="w-5 h-5" />
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleToggleStatus(teacher.id, teacher.status)}
                                className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                                title="Khóa tài khoản"
                              >
                                <Lock className="w-5 h-5" />
                              </button>
                            )}
                            <button 
                              onClick={() => handleResetPassword(teacher.id)}
                              className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Reset mật khẩu"
                            >
                              <Key className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => openEditModal(teacher)}
                              className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Chỉnh sửa"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handleDeleteTeacher(teacher.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Xóa"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredTeachers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                          Không tìm thấy giáo viên nào
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : activeLibraryView === 'main' ? (
          <>
            <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-800">Thư viện tương tác</h1>
                <p className="mt-1 text-sm text-slate-500">{ECOSYSTEM_APPLICATIONS.length} ứng dụng trong hệ sinh thái lớp học thông minh</p>
              </div>
            </header>
            <div className="flex-1 overflow-auto p-4 md:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
                <button
                  type="button"
                  onClick={() => setActiveLibraryView('gesture-class')}
                  className="group rounded-2xl border border-indigo-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md md:p-6"
                >
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 transition-transform group-hover:scale-110 md:mb-4 md:h-12 md:w-12">
                    <MonitorPlay className="h-5 w-5 md:h-6 md:w-6" />
                  </div>
                  <h3 className="mb-1 text-sm font-bold text-slate-800 md:mb-2 md:text-lg">GestureClass</h3>
                  <p className="line-clamp-2 text-[10px] text-slate-500 md:text-sm">Quản lý lớp, ngân hàng câu hỏi, trắc nghiệm cử chỉ, lật thẻ và gọi tên học sinh.</p>
                </button>

                <div 
                  onClick={() => setActiveLibraryView('lucky-draw')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <Target className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">Vòng quay may mắn</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Vòng quay ngẫu nhiên tạo sự hứng thú trong các hoạt động trên lớp.</p>
                </div>

                <div 
                  onClick={() => setActiveLibraryView('lucky-draw-cards')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <BookOpen className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">Bốc thẻ</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Công cụ bốc thẻ ngẫu nhiên với hiệu ứng lật thẻ và điều khiển bằng cử chỉ.</p>
                </div>

                <div 
                  onClick={() => setActiveLibraryView('plicker')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <QrCode className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">Tương tác thẻ Plicker</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Công cụ đánh giá trắc nghiệm nhanh sử dụng thẻ mã QR.</p>
                </div>

                <div 
                  onClick={() => setActiveLibraryView('learning-wall')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <LayoutDashboard className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">Tường học tập</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Quản lý lớp học, học sinh, chấm điểm và tổ chức thư mục học tập.</p>
                </div>

                <div 
                  onClick={() => setActiveLibraryView('head-shake-game')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <MonitorPlay className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">Trò chơi lắc đầu chọn đáp án</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Trò chơi tương tác chọn đáp án bằng cách gật đầu hoặc lắc đầu thông qua camera.</p>
                </div>

                <div 
                  onClick={() => setActiveLibraryView('chatbot')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <MessageSquare className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">AI Phân tích tâm lý</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Chatbot AI hỗ trợ phân tích tâm lý học đường, tư vấn giải pháp cho giáo viên và phụ huynh.</p>
                </div>

                <div 
                  onClick={() => setActiveLibraryView('create-exam')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <ClipboardCheck className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">Tạo kì thi</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Công cụ tạo và quản lý các kì thi, bài kiểm tra trực tuyến.</p>
                </div>

                <div 
                  onClick={() => setActiveLibraryView('secret-box')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <Gift className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">Mở ô bí mật</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Trò chơi chọn ô bí mật để nhận phần thưởng hoặc trả lời câu hỏi.</p>
                </div>

                <div 
                  onClick={() => setActiveLibraryView('drag-drop-game')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-cyan-100 text-cyan-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <Hand className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">Kéo thả đúng chỗ</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Trò chơi tương tác kéo thả đáp án vào vị trí chính xác trên hình ảnh hoặc văn bản.</p>
                </div>

                <div 
                  onClick={() => setActiveLibraryView('excel-merger')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <FileSpreadsheet className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">Gộp file Excel</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Công cụ gộp dữ liệu từ nhiều tệp Excel thành một tệp duy nhất nhanh chóng.</p>
                </div>

                <div 
                  onClick={() => setActiveLibraryView('pdf-merger')}
                  className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="w-9 h-9 md:w-12 md:h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center mb-2 md:mb-4 group-hover:scale-110 transition-transform">
                    <FileText className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800 mb-1 md:mb-2">Tách, gộp file PDF</h3>
                  <p className="text-slate-500 text-[10px] md:text-sm line-clamp-2">Tách từng trang, trích khoảng trang hoặc gộp nhiều tệp PDF an toàn ngay trên thiết bị.</p>
                </div>
              </div>
            </div>
          </>
        ) : activeLibraryView === 'learning-wall' ? (
          <div className="flex-1 min-h-0 overflow-auto"><LearningWall key={accessScope.ownerUid} currentUser={currentUser} onBack={() => setActiveLibraryView('main')} /></div>
        ) : activeLibraryView === 'gesture-class' ? (
          <GestureClass onBack={() => setActiveLibraryView('main')} />
        ) : activeLibraryView === 'create-exam' ? (
          <ExamManager key={accessScope.ownerUid} initialMode="teacher" onBack={() => setActiveLibraryView('main')} currentUser={currentUser} />
        ) : activeLibraryView === 'chatbot' ? (
          <div className="flex-1 flex flex-col h-full bg-slate-50">
            <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5 flex items-center gap-4 shrink-0">
              <button 
                onClick={() => setActiveLibraryView('main')}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-indigo-600" />
                AI Phân tích tâm lý bạo lực học đường
              </h1>
            </header>
            <div className="flex-1 overflow-hidden p-4 md:p-8">
              <div className="max-w-4xl mx-auto h-full">
                <AIChatbot />
              </div>
            </div>
          </div>
        ) : activeLibraryView === 'secret-box' ? (
          <SecretBoxGame onBack={() => setActiveLibraryView('main')} />
        ) : activeLibraryView === 'excel-merger' ? (
          <ExcelMerger onBack={() => setActiveLibraryView('main')} />
        ) : activeLibraryView === 'pdf-merger' ? (
          <PdfMerger onBack={() => setActiveLibraryView('main')} />
        ) : activeLibraryView === 'drag-drop-game' ? (
          <DragDropGame onBack={() => setActiveLibraryView('main')} />
        ) : activeLibraryView === 'lucky-draw' || activeLibraryView === 'lucky-draw-cards' ? (
          <LuckyDraw 
            onBack={() => setActiveLibraryView('main')} 
            initialMode={activeLibraryView === 'lucky-draw-cards' ? 'cards' : 'wheel'}
          />
        ) : activeLibraryView === 'head-shake-game' ? (
          <HeadShakeGame onBack={() => setActiveLibraryView('main')} />
        ) : activeLibraryView === 'plicker' ? (
          <PlickerScanner 
            key={accessScope.ownerUid}
            onBack={() => setActiveLibraryView('main')}
            onLogout={onLogout}
            schoolName={currentUser === 'admin' ? '' : currentUser?.school || ''}
            teacherName={currentUser === 'admin' ? '' : currentUser?.name || ''}
            isAdministrator={currentUser === 'admin'}
            synchronizedReports={synchronizedPlickerReports}
            administratorQuestionSets={administratorQuestionSets}
            categories={plickerCategories}
            categoriesReady={categoriesReady}
            allStudents={plickerStudents}
            onCreateClass={(title, studentNames) => {
              const classId = Math.random().toString(36).substr(2, 9);
              const newCategory = {
                id: classId,
                title,
                authorId: accessScope.ownerUid,
                createdAt: new Date().toISOString()
              };
              setCategories(previous => [...previous, newCategory]);
              void setDoc(doc(db, 'categories', classId), newCategory).catch(error => {
                console.error('Không thể lưu lớp học tương tác thẻ:', error);
              });
              
              if (studentNames && studentNames.length > 0) {
                const newStudents = studentNames.map(name => ({
                  id: Math.random().toString(36).substr(2, 9),
                  classId,
                  name,
                  teacherId: accessScope.ownerUid,
                  createdAt: new Date().toISOString()
                }));
                setStudents(previous => assignPlickerCardIds([...previous, ...newStudents]));
              }
            }}
            onDeleteClass={async classId => {
              const removedCategory = categories.find(category => category.id === classId);
              const removedStudents = students.filter(student => student.classId === classId);
              setCategories(previous => previous.filter(category => category.id !== classId));
              setStudents(previous => previous.filter(student => student.classId !== classId));
              try {
                await deleteDoc(doc(db, 'categories', classId));
              } catch (error) {
                if (removedCategory) {
                  setCategories(previous => previous.some(category => category.id === classId)
                    ? previous
                    : [...previous, removedCategory]);
                }
                if (removedStudents.length) {
                  setStudents(previous => assignPlickerCardIds([
                    ...previous.filter(student => student.classId !== classId),
                    ...removedStudents,
                  ]));
                }
                throw error;
              }
            }}
            onAddStudents={(classId, names) => {
              const newStudents = names.map(name => ({
                id: Math.random().toString(36).substr(2, 9),
                classId,
                name,
                teacherId: accessScope.ownerUid,
                createdAt: new Date().toISOString()
              }));
              setStudents(previous => assignPlickerCardIds([...previous, ...newStudents]));
            }}
            onUpdateStudent={(studentId, name) => {
              setStudents(previous => renamePlickerStudent(previous, studentId, name));
            }}
            onDeleteStudent={studentId => {
              setStudents(previous => removePlickerStudent(previous, studentId));
            }}
            onSyncStudents={rosters => {
              if (!categoriesReady) return;
              setStudents(previous => {
                const synchronized = mergePlickerCloudRosters(
                  previous,
                  rosters,
                  plickerCategories.map(classroom => classroom.id),
                );
                return synchronized === previous ? previous : assignPlickerCardIds(synchronized);
              });
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden relative transition-colors duration-300" style={{ backgroundColor: wallBgColor }}>
            {/* Header */}
            <header className="px-8 py-6 flex items-start justify-between z-10">
              <div>
                <div className="flex items-center gap-2 text-slate-700 mb-1">
                  <button 
                    onClick={() => {
                      if (activeClassId) {
                        setActiveClassId(null);
                      } else if (openedClassId) {
                        setOpenedClassId(null);
                      } else {
                        setActiveLibraryView('main');
                      }
                    }}
                    className="p-1 hover:bg-black/5 rounded transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  {openedClassId && !activeClassId && (
                    <span className="text-sm font-medium opacity-80 uppercase tracking-wide">
                      {myCategories.find(c => c.id === openedClassId)?.author || 'TUYEN TRUNG'} + 14 • {myCategories.find(c => c.id === openedClassId)?.time || '12ngày'}
                    </span>
                  )}
                </div>
                <h1 className="text-3xl font-bold text-slate-900 font-serif">
                  {activeClassId ? `Danh sách học sinh: ${myCategories.find(c => c.id === activeClassId)?.title}` : 
                   openedClassId ? myCategories.find(c => c.id === openedClassId)?.title : 'Tường học tập'}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                {!activeClassId && !openedClassId && (
                  <>
                    <button 
                      onClick={() => setIsCreateClassModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/40 hover:bg-white/60 text-slate-800 rounded-lg transition-colors font-medium shadow-sm border border-black/5"
                    >
                      <Plus className="w-4 h-4" />
                      Tạo lớp
                    </button>
                    <button 
                      onClick={() => setIsThemeModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/40 hover:bg-white/60 text-slate-800 rounded-lg transition-colors font-medium shadow-sm border border-black/5"
                    >
                      <Settings className="w-4 h-4" />
                      Cài đặt giao diện
                    </button>
                  </>
                )}
                {openedClassId && !activeClassId && (
                  <>
                    <div className="flex items-center gap-2 mr-2">
                      <span className="text-sm text-slate-700 font-medium">Sắp xếp:</span>
                      <select
                        value={`${postSortBy}-${postSortOrder}`}
                        onChange={(e) => {
                          const [by, order] = e.target.value.split('-');
                          setPostSortBy(by as any);
                          setPostSortOrder(order as any);
                        }}
                        className="text-sm bg-white/40 border border-black/5 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                      >
                        <option value="createdAt-desc">Mới nhất</option>
                        <option value="createdAt-asc">Cũ nhất</option>
                        <option value="score-desc">Điểm cao nhất</option>
                        <option value="score-asc">Điểm thấp nhất</option>
                        <option value="comments-desc">Nhiều bình luận nhất</option>
                        <option value="comments-asc">Ít bình luận nhất</option>
                      </select>
                    </div>
                    <button 
                      onClick={() => setIsThemeModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/40 hover:bg-white/60 text-slate-800 rounded-lg transition-colors font-medium shadow-sm border border-black/5"
                    >
                      <Settings className="w-4 h-4" />
                      Cài đặt giao diện
                    </button>
                    <button 
                      onClick={() => setActiveClassId(openedClassId)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/40 hover:bg-white/60 text-slate-800 rounded-lg transition-colors font-medium shadow-sm border border-black/5"
                    >
                      <Users className="w-4 h-4" />
                      Danh sách học sinh
                    </button>
                  </>
                )}
              </div>
            </header>

            {/* Board Content */}
            {activeClassId ? (
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-xl font-bold text-slate-800 mb-6">Nhập danh sách học sinh từ Excel</h2>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Dán danh sách học sinh (mỗi dòng 1 học sinh)</label>
                    <textarea
                      value={excelInput}
                      onChange={(e) => setExcelInput(e.target.value)}
                      className="w-full h-40 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                      placeholder="Nguyễn Văn A&#10;Trần Thị B&#10;Lê Văn C"
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={handleExcelPaste}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm"
                      >
                        Thêm danh sách
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-800 mb-4">Danh sách học sinh trong lớp ({students.filter(s => s.classId === activeClassId).length})</h3>
                  <div className="space-y-2">
                    {students.filter(s => s.classId === activeClassId).map((student, index) => (
                      <div key={student.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-slate-400 font-medium">{index + 1}.</span>
                          <span className="font-medium text-slate-800">{student.name}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteStudent(student.id)}
                          className="text-slate-400 hover:text-red-600 transition-colors p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {students.filter(s => s.classId === activeClassId).length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        Chưa có học sinh nào. Hãy dán danh sách từ Excel để thêm nhanh.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : openedClassId ? (
              <div className="flex-1 overflow-x-auto overflow-y-hidden px-8 pb-8 flex items-start gap-6">
                {myCategories.filter(c => c.parentId === openedClassId).map(category => (
                  <div key={category.id} className="w-80 flex-shrink-0 flex flex-col max-h-full">
                    <div className={`flex items-start justify-between mb-3 px-1 ${category.color ? 'p-3 rounded-xl shadow-sm' : ''}`} style={category.color ? { backgroundColor: category.color } : {}}>
                      {editingCategoryId === category.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingCategoryTitle}
                            onChange={(e) => setEditingCategoryTitle(e.target.value)}
                            className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-900"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameCategory(category.id);
                              if (e.key === 'Escape') setEditingCategoryId(null);
                            }}
                          />
                          <button onClick={() => handleRenameCategory(category.id)} className="text-emerald-600 hover:text-emerald-700">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingCategoryId(null)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <h2 className="font-bold text-slate-900 text-[15px] leading-tight px-1">{category.title}</h2>
                          <div className="relative group">
                            <button className="p-1 hover:bg-black/5 rounded text-slate-700 transition-colors mt-0.5">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                              <button 
                                onClick={() => {
                                  setEditingCategoryId(category.id);
                                  setEditingCategoryTitle(category.title);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <Edit2 className="w-4 h-4" />
                                Đổi tên
                              </button>
                              <button 
                                onClick={() => {
                                  handleDeleteCategory(category.id);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" />
                                Xóa
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className="relative group/add">
                      <button 
                        className="w-full py-2 bg-white/40 hover:bg-white/60 rounded-xl border border-black/5 flex items-center justify-center text-slate-700 transition-colors mb-4 shadow-sm"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                      <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-lg shadow-lg border border-slate-200 opacity-0 invisible group-hover/add:opacity-100 group-hover/add:visible transition-all z-20">
                        <button 
                          onClick={() => {
                            setCameraTarget({ type: 'category', categoryId: category.id });
                            setIsCameraOpen(true);
                          }}
                          className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 rounded-lg"
                        >
                          <Camera className="w-4 h-4 text-indigo-600" />
                          <span className="font-medium">Chụp ảnh camera</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-2 custom-scrollbar">
                      {posts.filter(p => p.categoryId === category.id)
                        .sort((a, b) => {
                          let valA, valB;
                          if (postSortBy === 'score') {
                            valA = a.score || 0;
                            valB = b.score || 0;
                          } else if (postSortBy === 'comments') {
                            valA = a.comments?.length || 0;
                            valB = b.comments?.length || 0;
                          } else {
                            valA = new Date(a.createdAt).getTime();
                            valB = new Date(b.createdAt).getTime();
                          }
                          if (valA < valB) return postSortOrder === 'asc' ? -1 : 1;
                          if (valA > valB) return postSortOrder === 'asc' ? 1 : -1;
                          return 0;
                        })
                        .map(post => (
                        <div key={post.id} className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 font-bold text-xs">
                                  {post.studentName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-bold text-sm text-slate-900">{post.studentName}</div>
                                  <div className="text-xs text-slate-500">cách đây 14 ngày trước</div>
                                </div>
                              </div>
                              <button 
                                onClick={async () => {
                                  try {
                                    await deleteDoc(doc(db, 'wall_posts', post.id));
                                  } catch (err) {
                                    console.error("Error deleting post:", err);
                                  }
                                }}
                                className="text-slate-400 hover:text-red-600 transition-colors"
                                title="Xóa bài"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </div>
                            
                            <h4 className="font-bold text-slate-900 text-sm mb-2">Bài nộp của {post.studentName}</h4>
                            
                            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 mb-3">
                              <img src={post.imageSrc} alt="Bài làm" className="w-full h-auto object-contain" />
                            </div>
                            
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                              <button 
                                onClick={() => setActiveScorePostId(activeScorePostId === post.id ? null : post.id)}
                                className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${post.score ? 'text-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                              >
                                <CheckSquare className="w-4 h-4" />
                                {post.score ? `${post.score}/10 (1) Điểm` : '0/10 (1) Điểm'}
                              </button>
                              <div className="flex items-center gap-1 text-slate-400 text-xs">
                                <MessageCircle className="w-4 h-4" />
                                <span>{post.comments?.length || 0}</span>
                              </div>
                            </div>
                            
                            {activeScorePostId === post.id && (
                              <div className="mt-3 pt-3 border-t border-slate-100">
                                <div className="flex flex-wrap gap-1.5">
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
                                    <button
                                      key={score}
                                      onClick={async () => {
                                        try {
                                          await updateDoc(doc(db, 'wall_posts', post.id), { score });
                                          setActiveScorePostId(null);
                                        } catch (err) {
                                          console.error("Error scoring post:", err);
                                        }
                                      }}
                                      className={`w-8 h-8 rounded-full border text-xs font-medium transition-colors ${
                                        post.score === score 
                                          ? 'bg-indigo-600 text-white border-indigo-600' 
                                          : 'border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                                      }`}
                                    >
                                      {score}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {post.comments && post.comments.length > 0 && (
                              <div className="space-y-2 mb-3 mt-3">
                                {post.comments.map(comment => (
                                  <div key={comment.id} className="bg-slate-50 rounded-lg p-2 text-sm text-slate-700">
                                    {comment.text}
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                              <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                                <Plus className="w-3 h-3" />
                              </div>
                              <input 
                                type="text"
                                placeholder="Thêm bình luận"
                                className="flex-1 text-xs bg-transparent border-none focus:ring-0 text-slate-600 placeholder:text-slate-400 outline-none"
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                    const text = e.currentTarget.value.trim();
                                    const newComment = { id: Math.random().toString(), text, createdAt: new Date().toISOString() };
                                    try {
                                      await updateDoc(doc(db, 'wall_posts', post.id), {
                                        comments: arrayUnion(newComment)
                                      });
                                      e.currentTarget.value = '';
                                    } catch (err) {
                                      console.error("Error adding comment:", err);
                                    }
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Add Column Button */}
                <div className="w-80 flex-shrink-0 pt-1">
                  {isAddingCategory ? (
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                      <input
                        type="text"
                        value={newCategoryTitle}
                        onChange={(e) => setNewCategoryTitle(e.target.value)}
                        placeholder="Nhập tên danh mục..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 mb-2"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddCategory();
                          if (e.key === 'Escape') setIsAddingCategory(false);
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={handleAddCategory}
                          className="flex-1 bg-indigo-600 text-white py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                        >
                          Lưu
                        </button>
                        <button 
                          onClick={() => setIsAddingCategory(false)}
                          className="flex-1 bg-slate-100 text-slate-600 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsAddingCategory(true)}
                      className="w-full py-2 px-4 bg-transparent hover:bg-black/5 rounded-xl flex items-center text-slate-600 font-medium transition-colors"
                    >
                      Thêm hạng mục
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-8 pb-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {/* Create Padlet Button */}
                  <div className="flex flex-col gap-3">
                    <div 
                      onClick={() => setIsCreateClassModalOpen(true)}
                      className="h-32 rounded-xl border-2 border-dashed border-slate-300 bg-slate-100/50 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <Plus className="w-8 h-8 text-slate-400" />
                    </div>
                    <div className="font-bold text-slate-500 text-[15px] px-1">Tạo một padlet</div>
                  </div>

                  {myCategories.filter(c => !c.parentId).map(category => (
                    <div 
                      key={category.id} 
                      onClick={() => setOpenedClassId(category.id)}
                      className="flex flex-col gap-3 cursor-pointer group"
                    >
                      <div className="h-32 rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-shadow" style={{ backgroundColor: category.bgType === 'color' ? category.bgValue : '#e2e8f0' }}>
                        {category.bgType === 'image' && (
                          <img 
                            src={category.bgValue || `https://picsum.photos/seed/${category.id}/400/200`} 
                            alt="Cover" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                      <div className="flex items-start justify-between px-1">
                        <div>
                          <h3 className="font-bold text-slate-800 text-[15px] truncate max-w-[200px]">{category.title}</h3>
                          <div className="text-xs text-slate-500 mt-0.5 uppercase tracking-wide">
                            {category.author || 'TUYEN TRUNG'} • {category.time || 'Vừa xong'}
                          </div>
                        </div>
                        <div className="relative group/menu">
                          <button 
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 hover:bg-black/5 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                          <div className="absolute right-0 bottom-full mb-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-20">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryId(category.id);
                                setEditingCategoryTitle(category.title);
                                setOpenedClassId(category.id);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <Edit2 className="w-4 h-4" />
                              Đổi tên
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveClassId(category.id);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <Users className="w-4 h-4" />
                              Danh sách học sinh
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCategory(category.id);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Xóa
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Navigation */}
      {!(activeTab === 'library' && activeLibraryView !== 'main') && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around p-2 z-50">
          {currentUser === 'admin' && (
            <button 
              onClick={() => setActiveTab('teachers')}
              className={`flex flex-col items-center gap-1 p-2 transition-colors ${
                activeTab === 'teachers' ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              <Users className="w-6 h-6" />
              <span className="text-[10px] font-medium">Giáo viên</span>
            </button>
          )}
          <button 
            onClick={() => {
              setActiveTab('library');
              setActiveLibraryView('main');
            }}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${
              activeTab === 'library' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <Library className="w-6 h-6" />
            <span className="text-[10px] font-medium">Thư viện</span>
          </button>
        </nav>
      )}

      {/* Add Teacher Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Cấp tài khoản giáo viên</h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddTeacher} className="p-6 space-y-4 overflow-y-auto">
              {teacherAccountError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {teacherAccountError}
                </div>
              )}
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden flex items-center justify-center">
                    {newTeacher.avatar ? (
                      <img src={newTeacher.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-10 h-10 text-slate-400" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCameraTarget('new');
                      setIsCameraOpen(true);
                    }}
                    className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors shadow-sm"
                    title="Chụp ảnh hồ sơ"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ và tên</label>
                <input 
                  type="text" 
                  required
                  value={newTeacher.name}
                  onChange={(e) => setNewTeacher({...newTeacher, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nhập họ và tên"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên đăng nhập</label>
                <input 
                  type="text" 
                  required
                  value={newTeacher.username}
                  onChange={(e) => setNewTeacher({...newTeacher, username: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nhập tên đăng nhập"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input 
                  type="email" 
                  required
                  value={newTeacher.email}
                  onChange={(e) => setNewTeacher({...newTeacher, email: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nhập địa chỉ email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu cấp cho giáo viên</label>
                <div className="relative">
                  <input
                    type={showNewTeacherPassword ? 'text' : 'password'}
                    required
                    minLength={MINIMUM_TEACHER_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    value={newTeacherPassword}
                    onChange={event => {
                      setNewTeacherPassword(event.target.value);
                      setTeacherAccountError('');
                    }}
                    className="w-full px-3 py-2 pr-11 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Nhập mật khẩu từ 8 ký tự"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewTeacherPassword(value => !value)}
                    aria-label={showNewTeacherPassword ? 'Ẩn mật khẩu giáo viên' : 'Hiện mật khẩu giáo viên'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                  >
                    {showNewTeacherPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Xác nhận mật khẩu</label>
                <input
                  type={showNewTeacherPassword ? 'text' : 'password'}
                  required
                  minLength={MINIMUM_TEACHER_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={newTeacherPasswordConfirmation}
                  onChange={event => {
                    setNewTeacherPasswordConfirmation(event.target.value);
                    setTeacherAccountError('');
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nhập lại mật khẩu giáo viên"
                />
                <p className="mt-1 text-xs text-slate-500">Giáo viên đăng nhập bằng email và mật khẩu được cấp.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Đơn vị công tác</label>
                <input 
                  type="text" 
                  required
                  value={newTeacher.school}
                  onChange={(e) => setNewTeacher({...newTeacher, school: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Tên trường học / trung tâm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cấp học</label>
                <select 
                  value={newTeacher.level}
                  onChange={(e) => setNewTeacher({...newTeacher, level: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  <option value="Mầm non">Mầm non</option>
                  <option value="Tiểu học">Tiểu học</option>
                  <option value="THCS">THCS</option>
                  <option value="THPT">THPT</option>
                  <option value="Đại học/Cao đẳng">Đại học/Cao đẳng</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>
              <div className="pt-4 flex items-center justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  disabled={isCreatingTeacher}
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreatingTeacher ? 'Đang cấp tài khoản...' : 'Cấp tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Teacher Modal */}
      {isEditModalOpen && editingTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Chỉnh sửa thông tin</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleEditTeacher} className="p-6 space-y-4">
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden flex items-center justify-center">
                    {editingTeacher.avatar ? (
                      <img src={editingTeacher.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-10 h-10 text-slate-400" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCameraTarget('edit');
                      setIsCameraOpen(true);
                    }}
                    className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors shadow-sm"
                    title="Chụp ảnh hồ sơ"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ và tên</label>
                <input 
                  type="text" 
                  required
                  value={editingTeacher.name}
                  onChange={(e) => setEditingTeacher({...editingTeacher, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nhập họ và tên"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên đăng nhập</label>
                <input 
                  type="text" 
                  required
                  value={editingTeacher.username}
                  onChange={(e) => setEditingTeacher({...editingTeacher, username: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nhập tên đăng nhập"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input 
                  type="email" 
                  required
                  value={editingTeacher.email}
                  onChange={(e) => setEditingTeacher({...editingTeacher, email: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nhập địa chỉ email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Đơn vị công tác</label>
                <input 
                  type="text" 
                  required
                  value={editingTeacher.school}
                  onChange={(e) => setEditingTeacher({...editingTeacher, school: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Tên trường học / trung tâm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cấp học</label>
                <select 
                  value={editingTeacher.level}
                  onChange={(e) => setEditingTeacher({...editingTeacher, level: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  <option value="Mầm non">Mầm non</option>
                  <option value="Tiểu học">Tiểu học</option>
                  <option value="THCS">THCS</option>
                  <option value="THPT">THPT</option>
                  <option value="Đại học/Cao đẳng">Đại học/Cao đẳng</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Trạng thái</label>
                <select 
                  value={editingTeacher.status}
                  onChange={(e) => setEditingTeacher({...editingTeacher, status: e.target.value as 'active' | 'inactive'})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  <option value="active">Hoạt động</option>
                  <option value="inactive">Khóa</option>
                </select>
              </div>
              <div className="pt-4 flex items-center justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Cập nhật
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Confirm Dialog Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmDialog.title}</h3>
              <p className="text-slate-600 mb-4">{confirmDialog.message}</p>
              
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button 
                  onClick={() => confirmDialog.onConfirm()}
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Camera Capture Modal */}
      {isCameraOpen && (
        <CameraCapture 
          onClose={() => {
            setIsCameraOpen(false);
            setCameraTarget(null);
          }}
          onCapture={(imageSrc) => {
            if (cameraTarget === 'new') {
              setNewTeacher(prev => ({ ...prev, avatar: imageSrc }));
            } else if (cameraTarget === 'edit' && editingTeacher) {
              setEditingTeacher(prev => prev ? { ...prev, avatar: imageSrc } : null);
            } else if (cameraTarget === 'global_post') {
              setPendingPostImage(imageSrc);
              setIsPostModalOpen(true);
            } else if (cameraTarget && typeof cameraTarget === 'object' && cameraTarget.type === 'category') {
              setPendingPostImage(imageSrc);
              setPostFormData({ categoryId: cameraTarget.categoryId, studentId: '' });
              setIsPostModalOpen(true);
            }
            setIsCameraOpen(false);
            setCameraTarget(null);
          }}
        />
      )}

      {/* Global Post Modal */}
      {isPostModalOpen && pendingPostImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Đăng bài học sinh</h3>
              <button 
                onClick={() => {
                  setIsPostModalOpen(false);
                  setPendingPostImage(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (postFormData.categoryId && postFormData.studentId) {
                const student = students.find(s => s.id === postFormData.studentId);
                try {
                  await addDoc(collection(db, 'wall_posts'), {
                    categoryId: postFormData.categoryId,
                    authorId: accessScope.ownerUid,
                    teacherId: accessScope.ownerUid,
                    imageSrc: pendingPostImage,
                    studentName: student ? student.name : 'Học sinh',
                    createdAt: serverTimestamp()
                  });
                  setIsPostModalOpen(false);
                  setPendingPostImage(null);
                  setPostFormData({ categoryId: '', studentId: '' });
                } catch (err) {
                  console.error("Error adding post:", err);
                }
              }
            }} className="p-6 space-y-4">
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 flex justify-center h-48">
                <img src={pendingPostImage} alt="Preview" className="h-full w-auto object-contain" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hạng mục</label>
                <select 
                  required
                  value={postFormData.categoryId}
                  onChange={e => setPostFormData({...postFormData, categoryId: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                >
                  <option value="">Chọn hạng mục</option>
                  {myCategories.filter(c => c.parentId === openedClassId).map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Học sinh</label>
                <select 
                  required
                  value={postFormData.studentId}
                  onChange={e => setPostFormData({...postFormData, studentId: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  disabled={!postFormData.categoryId}
                >
                  <option value="">Chọn học sinh</option>
                  {students.filter(s => s.classId === openedClassId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => {
                    setIsPostModalOpen(false);
                    setPendingPostImage(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Đăng bài
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Class Modal */}
      {isCreateClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Tạo lớp học mới</h3>
              <button 
                onClick={() => setIsCreateClassModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateClass} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên lớp</label>
                <input 
                  type="text" 
                  required
                  value={newClass.name}
                  onChange={e => setNewClass({...newClass, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="VD: Lớp 10A1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Thêm học sinh (Copy từ Excel)</label>
                <textarea 
                  value={newClass.academicYear}
                  onChange={e => setNewClass({...newClass, academicYear: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all min-h-[150px]"
                  placeholder="Dán danh sách học sinh từ Excel vào đây..."
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsCreateClassModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Tạo lớp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Theme Settings Modal */}
      {isThemeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Cài đặt giao diện</h3>
              <button 
                onClick={() => setIsThemeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Màu nền</label>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    '#FFD524', '#FF4F64', '#4ADE80', '#60A5FA', '#A78BFA', 
                    '#F472B6', '#FBBF24', '#34D399', '#38BDF8', '#818CF8',
                    '#F0F2F5', '#1E293B', '#0F172A', '#FFFFFF', '#E2E8F0'
                  ].map((color) => (
                    <button
                      key={color}
                      onClick={() => setWallBgColor(color)}
                      className={`w-12 h-12 rounded-full border-2 transition-all ${wallBgColor === color ? 'border-indigo-600 scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
              
              <div className="pt-4 flex justify-end border-t border-slate-200">
                <button 
                  onClick={() => setIsThemeModalOpen(false)}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Xong
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
