import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Camera, Play, Square, CheckCircle, XCircle, BarChart3, Users, RefreshCw, Plus, X, Printer, CheckSquare, Edit, Clock, Folder, FileText, Grid, PlusCircle, Search, MoreHorizontal, Check, Undo, Redo, AlignLeft, AlignCenter, AlignRight, Sigma, Copy, Trash2, Image, Video, Volume2, Home, Film, Download, Bold, Italic, Underline, Type, LayoutGrid, ChevronLeft, ChevronRight, ChevronUp, Mic, Music, PieChart, Archive, Share2, Upload, Settings, UserPlus, Loader2 } from 'lucide-react';
import { auth } from '../firebase';
import { createTeacherStorageKey } from '../lib/teacherIsolation';

const SuperscriptIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="5" y="10" width="9" height="10" rx="1" />
    <rect x="15" y="4" width="5" height="5" rx="1" />
  </svg>
);

const SubscriptIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="5" y="4" width="9" height="10" rx="1" />
    <rect x="15" y="15" width="5" height="5" rx="1" />
  </svg>
);

const FractionIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="9" y="3" width="6" height="6" rx="1" />
    <rect x="4" y="11" width="16" height="2" rx="1" />
    <rect x="9" y="15" width="6" height="6" rx="1" />
  </svg>
);

interface Student {
  id: string;
  classId: string;
  name: string;
}

interface Category {
  id: string;
  title: string;
  parentId?: string;
}

interface PlickerScannerProps {
  onBack: () => void;
  onLogout?: () => void;
  categories: Category[];
  allStudents: Student[];
  onCreateClass: (title: string, students?: string[]) => void;
  onAddStudents: (classId: string, names: string[]) => void;
}

interface ScanResult {
  studentId: string;
  studentName: string;
  answer: 'A' | 'B' | 'C' | 'D';
  timestamp: number;
}

export default function PlickerScanner({ onBack, onLogout, categories, allStudents, onCreateClass, onAddStudents }: PlickerScannerProps) {
  const questionSetsStorageKey = createTeacherStorageKey('plickerQuestionSets', auth.currentUser?.uid);
  const queuedSetsStorageKey = createTeacherStorageKey('plickerQueuedSets', auth.currentUser?.uid);
  const [view, setView] = useState<'dashboard' | 'scanner' | 'editor' | 'recent' | 'reports' | 'report_detail' | 'question_detail' | 'scoreboard' | 'mobile_recent' | 'mobile_classes' | 'mobile_library' | 'mobile_settings' | 'class_detail' | 'student_cards'>('dashboard');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // If we switch to mobile and were on dashboard, maybe show mobile_recent
      if (mobile && view === 'dashboard') {
        setView('mobile_recent');
      } else if (!mobile && view === 'mobile_recent') {
        setView('dashboard');
      }
    };
    
    // Initial check
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [view]);

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedScoreboardSetId, setSelectedScoreboardSetId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastDetected, setLastDetected] = useState<{id: string, name: string, answer: string, x: number, y: number}[]>([]);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  
  // Calendar state
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date(2026, 2, 20)); // March 20, 2026
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(new Date(2026, 2, 20));
  
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [pastedStudents, setPastedStudents] = useState('');
  
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [pastedNewStudents, setPastedNewStudents] = useState('');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [setToDelete, setSetToDelete] = useState<string | null>(null);

  const [isPlayNowModalOpen, setIsPlayNowModalOpen] = useState(false);
  const [playNowSetId, setPlayNowSetId] = useState<string | null>(null);
  const [activeClassTab, setActiveClassTab] = useState<'playing' | 'next' | 'upcoming' | 'reports' | 'students'>('playing');

  const handleDeleteSet = (e: React.MouseEvent, setId: string) => {
    e.stopPropagation();
    setSetToDelete(setId);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteSet = () => {
    if (setToDelete) {
      setQuestionSets(prev => prev.filter(s => s.id !== setToDelete));
      if (currentSetId === setToDelete) {
        setCurrentSetId(null);
        setCurrentSetTitle('Bộ không tên');
        setQuestions([{ id: 1, text: '', type: 'multiple_choice', gradingType: 'graded', options: { A: '', B: '', C: '', D: '' }, correctAnswer: null }]);
      }
      setSetToDelete(null);
      setIsDeleteModalOpen(false);
    }
  };
  
  const [isQueueDropdownOpen, setIsQueueDropdownOpen] = useState(false);
  const queueDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (queueDropdownRef.current && !queueDropdownRef.current.contains(event.target as Node)) {
        setIsQueueDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importOptionCount, setImportOptionCount] = useState<2 | 3 | 4>(4);
  const [importSearchText, setImportSearchText] = useState('');
  const [importRemoveMatchingLines, setImportRemoveMatchingLines] = useState(true);
  const [importMatchCase, setImportMatchCase] = useState(false);
  const [importAutoClean, setImportAutoClean] = useState(true);
  const importIndicatorRef = useRef<HTMLDivElement>(null);

  const [isRightToolbarOpen, setIsRightToolbarOpen] = useState(true);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [submittedImageQuery, setSubmittedImageQuery] = useState('');
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [submittedVideoQuery, setSubmittedVideoQuery] = useState('');
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [audioModalView, setAudioModalView] = useState<'record' | 'library'>('record');
  const [soundSearchQuery, setSoundSearchQuery] = useState('');
  
  const [questionSets, setQuestionSets] = useState<{
    id: string;
    title: string;
    questions: any[];
    createdAt: string;
    updatedAt: string;
  }[]>(() => {
    const defaultSets = [
      {
        id: '1',
        title: 'Bộ câu hỏi số 1',
        questions: [
          { id: 1, text: 'Thủ đô của Việt Nam là gì?', type: 'multiple_choice', gradingType: 'graded', options: { A: 'Hồ Chí Minh', B: 'Hà Nội', C: 'Đà Nẵng', D: 'Huế' }, correctAnswer: 'B' },
          { id: 2, text: '2 + 2 = ?', type: 'multiple_choice', gradingType: 'graded', options: { A: '3', B: '4', C: '5', D: '6' }, correctAnswer: 'B' }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: '2',
        title: 'Bộ câu hỏi số 2',
        questions: [
          { id: 1, text: 'Trái đất hình gì?', type: 'multiple_choice', gradingType: 'graded', options: { A: 'Vuông', B: 'Tròn', C: 'Cầu', D: 'Phẳng' }, correctAnswer: 'C' }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const saved = localStorage.getItem(questionSetsStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          const sets = parsed.map((set: any) => ({
            ...set,
            questions: set.questions || [],
            updatedAt: set.updatedAt || new Date().toISOString(),
            createdAt: set.createdAt || new Date().toISOString()
          }));
          
          // Ensure default sets exist
          const hasSet1 = sets.some((s: any) => s.title === 'Bộ câu hỏi số 1');
          const hasSet2 = sets.some((s: any) => s.title === 'Bộ câu hỏi số 2');
          
          if (!hasSet1) sets.push(defaultSets[0]);
          if (!hasSet2) sets.push(defaultSets[1]);
          
          return sets;
        }
      } catch (e) {
        console.error("Failed to parse question sets", e);
      }
    }
    return defaultSets;
  });
  const [queuedSets, setQueuedSets] = useState<{ [classId: string]: string[] }>(() => {
    const saved = localStorage.getItem(queuedSetsStorageKey);
    return saved ? JSON.parse(saved) : {};
  });
  const [currentSetId, setCurrentSetId] = useState<string | null>(null);
  const [currentSetTitle, setCurrentSetTitle] = useState('Bộ không tên');

  const groupedReports = useMemo(() => {
    const reports = questionSets.map(set => {
      const date = new Date(set.updatedAt);
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      
      return {
        id: set.id,
        title: set.title,
        className: categories.length > 0 ? categories[0].title : 'Chưa gán lớp',
        dateStr: `${day < 10 ? '0' + day : day} tháng ${month} năm ${year}`,
        monthYear: `Tháng ${month} năm ${year}`,
        scorePercentage: 0, // Placeholder
        questionCount: set.questions.length,
        thumbnailText: set.questions[0]?.text || 'Chưa có câu hỏi'
      };
    });

    return reports.reduce((acc, report) => {
      if (!acc[report.monthYear]) acc[report.monthYear] = [];
      acc[report.monthYear].push(report);
      return acc;
    }, {} as Record<string, any[]>);
  }, [questionSets, categories]);
  const isSwitchingSet = useRef(false);

  const [questions, setQuestions] = useState<{
    id: number;
    text: string;
    type: 'multiple_choice' | 'true_false';
    gradingType: 'graded' | 'survey';
    options: { A?: string; B?: string; C?: string; D?: string; };
    correctAnswer: 'A' | 'B' | 'C' | 'D' | null;
    image?: string;
    video?: string;
  }[]>([
    { id: 1, text: '', type: 'multiple_choice', gradingType: 'graded', options: { A: '', B: '', C: '', D: '' }, correctAnswer: null }
  ]);
  
  const [history, setHistory] = useState<{
    past: typeof questions[];
    future: typeof questions[];
  }>({ past: [], future: [] });
  
  const isUndoRedoAction = useRef(false);

  useEffect(() => {
    if (isSwitchingSet.current || isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    setHistory(prev => ({
      past: [...prev.past, questions],
      future: []
    }));
  }, [questions]);

  const handleUndo = () => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, prev.past.length - 1);
      isUndoRedoAction.current = true;
      setQuestions(previous);
      return {
        past: newPast,
        future: [questions, ...prev.future]
      };
    });
  };

  const handleRedo = () => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      isUndoRedoAction.current = true;
      setQuestions(next);
      return {
        past: [...prev.past, questions],
        future: newFuture
      };
    });
  };

  const handleImportQuestions = () => {
    if (!importText.trim()) return;
    
    let lines = importText.split('\n').map(l => l.trim()).filter(l => l);
    
    const newQuestions = [];
    const linesPerQuestion = importOptionCount + 1;
    
    for (let i = 0; i < lines.length; i += linesPerQuestion) {
      const qText = lines[i];
      const options = { A: '', B: '', C: '', D: '' };
      
      if (i + 1 < lines.length) options.A = lines[i + 1].replace(/^[A-D][\.\)]\s*/i, '');
      if (i + 2 < lines.length && importOptionCount >= 2) options.B = lines[i + 2].replace(/^[A-D][\.\)]\s*/i, '');
      if (i + 3 < lines.length && importOptionCount >= 3) options.C = lines[i + 3].replace(/^[A-D][\.\)]\s*/i, '');
      if (i + 4 < lines.length && importOptionCount >= 4) options.D = lines[i + 4].replace(/^[A-D][\.\)]\s*/i, '');
      
      newQuestions.push({
        id: Date.now() + i,
        text: qText.replace(/^\d+[\.\)]\s*/, ''),
        type: 'multiple_choice' as const,
        gradingType: 'graded' as const,
        options,
        correctAnswer: 'A' as const
      });
    }
    
    if (newQuestions.length > 0) {
      setQuestions(prev => {
        if (prev.length === 1 && !prev[0].text && !prev[0].options.A && !prev[0].options.B) {
          return newQuestions;
        }
        return [...prev, ...newQuestions];
      });
      setActiveQuestionId(newQuestions[0].id);
    }
    
    setIsImportModalOpen(false);
    setImportText('');
  };

  const handleFindAndRemove = () => {
    if (!importSearchText) return;
    
    let lines = importText.split('\n');
    const flags = importMatchCase ? 'g' : 'gi';
    
    if (importRemoveMatchingLines) {
      lines = lines.filter(line => {
        if (importMatchCase) {
          return !line.includes(importSearchText);
        } else {
          return !line.toLowerCase().includes(importSearchText.toLowerCase());
        }
      });
    } else {
      const regex = new RegExp(importSearchText, flags);
      lines = lines.map(line => line.replace(regex, ''));
    }
    
    setImportText(lines.join('\n'));
  };

  const removeQuestionNumbers = () => {
    const lines = importText.split('\n');
    const cleaned = lines.map(line => line.replace(/^\s*\d+[\.\)]\s*/, ''));
    setImportText(cleaned.join('\n'));
  };

  const removeOptionLetters = () => {
    const lines = importText.split('\n');
    const cleaned = lines.map(line => line.replace(/^\s*[A-D][\.\)]\s*/i, ''));
    setImportText(cleaned.join('\n'));
  };

  const removeBullets = () => {
    const lines = importText.split('\n');
    const cleaned = lines.map(line => line.replace(/^\s*[-•*]\s*/, ''));
    setImportText(cleaned.join('\n'));
  };

  const renderImportIndicators = () => {
    const lines = importText.split('\n');
    const indicators = [];
    let qIndex = 1;
    let optIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        indicators.push(<div key={i} style={{ height: '24px' }}></div>);
        continue;
      }
      
      if (optIndex === 0) {
        indicators.push(<div key={i} style={{ height: '24px' }} className="text-blue-500 font-bold flex items-center justify-center">{qIndex}</div>);
        optIndex++;
      } else {
        const labels = ['MỘT', 'B', 'C', 'D'];
        const label = labels[optIndex - 1] || '';
        const isCorrect = optIndex === 1;
        indicators.push(
          <div key={i} style={{ height: '24px' }} className={`text-[10px] font-bold flex items-center justify-center ${isCorrect ? 'text-emerald-500' : 'text-slate-400'}`}>
            {label}
          </div>
        );
        optIndex++;
        if (optIndex > importOptionCount) {
          optIndex = 0;
          qIndex++;
        }
      }
    }
    
    for (let i = 0; i < 10; i++) {
      indicators.push(<div key={`empty-${i}`} style={{ height: '24px' }}></div>);
    }
    
    return indicators;
  };

  const [activeQuestionId, setActiveQuestionId] = useState(1);
  const [playingQuestionIndex, setPlayingQuestionIndex] = useState(0);
  const [showGraph, setShowGraph] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Derived state for Now Playing view
  const playingSetId = selectedClassId ? (queuedSets[selectedClassId]?.[0] || null) : null;
  const playingSet = playingSetId ? questionSets.find(s => s.id === playingSetId) : null;
  const playingQuestion = playingSet ? playingSet.questions[playingQuestionIndex] : null;
  const currentClass = categories.find(c => c.id === selectedClassId);
  const classStudents = currentClass ? allStudents.filter(s => s.classId === currentClass.id) : [];

  useEffect(() => {
    if (playingQuestion) {
      setCorrectAnswer(playingQuestion.correctAnswer as any);
    } else {
      setCorrectAnswer(null);
    }
  }, [playingQuestion]);
  const [isMathSymbolsOpen, setIsMathSymbolsOpen] = useState(false);
  const [currentEquation, setCurrentEquation] = useState('');
  const [focusedField, setFocusedField] = useState<'text' | 'A' | 'B' | 'C' | 'D'>('text');
  const [activeFormat, setActiveFormat] = useState<string | null>('superscript');

  useEffect(() => {
    localStorage.setItem(questionSetsStorageKey, JSON.stringify(questionSets));
  }, [questionSets, questionSetsStorageKey]);

  useEffect(() => {
    localStorage.setItem(queuedSetsStorageKey, JSON.stringify(queuedSets));
  }, [queuedSets, queuedSetsStorageKey]);

  useEffect(() => {
    if (isSwitchingSet.current) {
      isSwitchingSet.current = false;
      return;
    }
    if (currentSetId) {
      setQuestionSets(prev => prev.map(s => s.id === currentSetId ? {
        ...s,
        title: currentSetTitle,
        questions,
        updatedAt: new Date().toISOString()
      } : s));
    }
  }, [questions, currentSetTitle, currentSetId]);

  const handleCreateNewSet = () => {
    const newSet = {
      id: Math.random().toString(36).substr(2, 9),
      title: 'Bộ không tên',
      questions: [
        { id: 1, text: '', type: 'multiple_choice' as const, gradingType: 'graded' as const, options: { A: '', B: '', C: '', D: '' }, correctAnswer: null as any }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setQuestionSets(prev => [newSet, ...prev]);
    isSwitchingSet.current = true;
    setCurrentSetId(newSet.id);
    setCurrentSetTitle(newSet.title);
    setQuestions(newSet.questions);
    setActiveQuestionId(1);
    setView('editor');
  };

  const handleOpenSet = (setId: string) => {
    const set = questionSets.find(s => s.id === setId);
    if (set) {
      isSwitchingSet.current = true;
      setCurrentSetId(set.id);
      setCurrentSetTitle(set.title);
      setQuestions(set.questions);
      setActiveQuestionId(set.questions[0]?.id || 1);
      setView('editor');
    }
  };

  const handlePlaySet = (setId: string) => {
    setPlayNowSetId(setId);
    setIsPlayNowModalOpen(true);
  };

  const startPlaying = (setId: string, classId: string) => {
    const set = questionSets.find(s => s.id === setId);
    if (set) {
      setSelectedClassId(classId);
      setQueuedSets(prev => {
        const classQueue = prev[classId] || [];
        // Remove the set if it's already in the queue and put it at the front
        const newQueue = [setId, ...classQueue.filter(id => id !== setId)];
        return { ...prev, [classId]: newQueue };
      });
      setPlayingQuestionIndex(0);
      setResults([]);
      setCurrentSetId(set.id);
      setCurrentSetTitle(set.title);
      setQuestions(set.questions);
      setActiveQuestionId(set.questions[0]?.id || 1);
      setView('scanner');
      setIsScanning(false);
      setIsPlayNowModalOpen(false);
    }
  };

  const formatRecentDate = (dateString: string) => {
    const date = new Date(dateString);
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = date.getMonth() + 1;

    return `${dayName}, ngày ${day} tháng ${month}`;
  };

  const groupQuestionSets = () => {
    const groups: { [key: string]: typeof questionSets } = {
      'Hôm nay': [],
      'Bước đều': [],
    };
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneWeekAgo = today - 7 * 24 * 60 * 60 * 1000;

    questionSets.forEach(set => {
      const setDate = new Date(set.updatedAt);
      const setTime = setDate.getTime();
      
      if (setTime >= today) {
        groups['Hôm nay'].push(set);
      } else if (setTime >= oneWeekAgo) {
        groups['Bước đều'].push(set);
      } else {
        const monthYear = `Tháng ${setDate.getMonth() + 1} năm ${setDate.getFullYear()}`;
        if (!groups[monthYear]) {
          groups[monthYear] = [];
        }
        groups[monthYear].push(set);
      }
    });
    
    return groups;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setQuestions(questions.map(q => 
          q.id === activeQuestionId 
            ? { ...q, image: reader.result as string } 
            : q
        ));
        setIsImageModalOpen(false);
        setImageSearchQuery('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageSelect = (imageUrl: string) => {
    setQuestions(questions.map(q => 
      q.id === activeQuestionId 
        ? { ...q, image: imageUrl, video: undefined } 
        : q
    ));
    setIsImageModalOpen(false);
    setImageSearchQuery('');
    setSubmittedImageQuery('');
  };

  const handleVideoSelect = (videoUrl: string) => {
    setQuestions(questions.map(q => 
      q.id === activeQuestionId 
        ? { ...q, video: videoUrl, image: undefined } 
        : q
    ));
    setIsVideoModalOpen(false);
    setVideoSearchQuery('');
    setSubmittedVideoQuery('');
  };

  const handleDeleteOption = (optToDelete: 'A' | 'B' | 'C' | 'D') => {
    setQuestions(questions.map(q => {
      if (q.id === activeQuestionId) {
        const currentOpts = ['A', 'B', 'C', 'D'] as const;
        const activeOpts = currentOpts.filter(o => q.options[o] !== undefined);
        
        // Don't allow deleting if only 2 options left
        if (activeOpts.length <= 2) return q;

        const newOptions: { A?: string; B?: string; C?: string; D?: string; } = {};
        let newCorrectAnswer = q.correctAnswer;
        
        let newIndex = 0;
        for (const opt of activeOpts) {
          if (opt === optToDelete) {
            if (q.correctAnswer === opt) newCorrectAnswer = null;
            continue;
          }
          const newOptKey = currentOpts[newIndex];
          newOptions[newOptKey] = q.options[opt];
          if (q.correctAnswer === opt) newCorrectAnswer = newOptKey;
          newIndex++;
        }
        
        return { ...q, options: newOptions, correctAnswer: newCorrectAnswer };
      }
      return q;
    }));
  };

  const handleAddOption = () => {
    setQuestions(questions.map(q => {
      if (q.id === activeQuestionId) {
        const currentOpts = ['A', 'B', 'C', 'D'] as const;
        const activeOpts = currentOpts.filter(o => q.options[o] !== undefined);
        
        if (activeOpts.length >= 4) return q;
        
        const nextOptKey = currentOpts[activeOpts.length];
        return {
          ...q,
          options: { ...q.options, [nextOptKey]: '' }
        };
      }
      return q;
    }));
  };

  const handleShuffleOptions = () => {
    setQuestions(questions.map(q => {
      if (q.id === activeQuestionId) {
        const currentOpts = ['A', 'B', 'C', 'D'] as const;
        const activeOpts = currentOpts.filter(o => q.options[o] !== undefined);
        
        if (activeOpts.length <= 1) return q;
        
        // Extract current values and correct answer
        const values = activeOpts.map(opt => q.options[opt]);
        const correctValue = q.correctAnswer ? q.options[q.correctAnswer] : null;
        
        // Shuffle values
        for (let i = values.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [values[i], values[j]] = [values[j], values[i]];
        }
        
        // Re-assign to options
        const newOptions: { A?: string; B?: string; C?: string; D?: string; } = {};
        let newCorrectAnswer = null;
        
        activeOpts.forEach((opt, index) => {
          newOptions[opt] = values[index];
          if (correctValue !== null && values[index] === correctValue) {
            newCorrectAnswer = opt;
          }
        });
        
        return { ...q, options: newOptions, correctAnswer: newCorrectAnswer };
      }
      return q;
    }));
  };

  const insertIntoActiveField = (textToInsert: string) => {
    setQuestions(questions.map(q => {
      if (q.id === activeQuestionId) {
        if (focusedField === 'text') {
          return { ...q, text: q.text + textToInsert };
        } else {
          const optKey = focusedField as 'A' | 'B' | 'C' | 'D';
          return { 
            ...q, 
            options: { 
              ...q.options, 
              [optKey]: q.options[optKey] + textToInsert 
            } 
          };
        }
      }
      return q;
    }));
  };

  const handleFormatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, isEquationField: boolean = false) => {
    if (!activeFormat || (activeFormat !== 'superscript' && activeFormat !== 'subscript')) return;
    
    const superscriptMap: Record<string, string> = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'x': 'ˣ', 'y': 'ʸ'
    };
    const subscriptMap: Record<string, string> = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
    };

    const map = activeFormat === 'superscript' ? superscriptMap : subscriptMap;

    if (map[e.key]) {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const char = map[e.key];
      
      if (isEquationField) {
        const newText = currentEquation.substring(0, start) + char + currentEquation.substring(end);
        setCurrentEquation(newText);
      } else {
        setQuestions(questions.map(q => {
          if (q.id === activeQuestionId) {
            if (focusedField === 'text') {
              const newText = q.text.substring(0, start) + char + q.text.substring(end);
              return { ...q, text: newText };
            } else {
              const optKey = focusedField as 'A' | 'B' | 'C' | 'D';
              const newText = q.options[optKey].substring(0, start) + char + q.options[optKey].substring(end);
              return { ...q, options: { ...q.options, [optKey]: newText } };
            }
          }
          return q;
        }));
      }
      
      setTimeout(() => {
        target.setSelectionRange(start + char.length, start + char.length);
      }, 0);
    }
  };

  const insertMathSymbol = (sym: string) => {
    setCurrentEquation(prev => prev + sym);
  };

  const handleInsertEquation = () => {
    if (!currentEquation) {
      setIsMathSymbolsOpen(false);
      return;
    }
    
    setQuestions(questions.map(q => {
      if (q.id === activeQuestionId) {
        if (focusedField === 'text') {
          return { ...q, text: q.text + currentEquation };
        } else {
          return { 
            ...q, 
            options: { 
              ...q.options, 
              [focusedField]: q.options[focusedField] + currentEquation 
            } 
          };
        }
      }
      return q;
    }));
    setCurrentEquation('');
    setIsMathSymbolsOpen(false);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  // Simulated Computer Vision Pipeline for Plickers
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to match video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // 1. Input: ảnh camera của lớp học
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // --- THUẬT TOÁN NHẬN DẠNG (Mô phỏng) ---
    // Trong thực tế, đây là nơi thực hiện:
    // 2. Detect: Chuyển grayscale, tạo ảnh biên (Canny), tìm contour vuông
    // 3. Normalize: Perspective transform để lấy vùng thẻ vuông vức, chia lưới 5x5
    // 4. Decode orientation: Đọc 4 ô góc để xác định chiều xoay (A/B/C/D)
    // 5. Decode identity: Đọc các ô data để lấy ID thẻ (1-63)
    // 6. Validate: Kiểm tra parity bit và các ô tĩnh

    requestRef.current = requestAnimationFrame(processFrame);
  }, [isScanning, classStudents, results, correctAnswer]);

  const handleAIScan = async () => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;
    
    setIsProcessing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Capture frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Visual flash effect
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setTimeout(() => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }, 100);

    const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    setIsProcessing(true);

    try {
      // Call the real Scan Plicker API
      const response = await fetch("/api/scan-plicker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData })
      });
      
      if (!response.ok) throw new Error("API scan error");
      const data = await response.json();
      const detections: { cardId: number, answer: 'A' | 'B' | 'C' | 'D' }[] = data.detections || [];
      
      if (detections.length > 0 && classStudents.length > 0) {
        const newResults: ScanResult[] = [];
        
        detections.forEach(det => {
          // Cards are 1-indexed, corresponding to index in class list
          const studentIndex = det.cardId - 1;
          const student = classStudents[studentIndex];
          
          if (student) {
            newResults.push({
              studentId: student.id,
              studentName: student.name,
              answer: det.answer,
              timestamp: Date.now()
            });
          }
        });

        if (newResults.length > 0) {
          // Update results: replace existing scan for the same student or add new one
          setResults(prev => {
            let updatedResults = [...prev];
            newResults.forEach(newR => {
              // Remove existing if present to move it to the end (top when reversed)
              updatedResults = updatedResults.filter(r => r.studentId !== newR.studentId);
              updatedResults.push(newR);
            });
            return updatedResults;
          });
          
          // Show visual feedback on screen
          const feedback = newResults.map((r, i) => ({
            id: r.studentId + i + Date.now(),
            name: r.studentName,
            answer: r.answer,
            x: 10 + Math.random() * 60, // Percent
            y: 20 + Math.random() * 50  // Percent
          }));
          
          setLastDetected(feedback);
          setTimeout(() => setLastDetected([]), 4000);
        }
      }
    } catch (err) {
      console.error("Error scanning cards:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (isScanning) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isScanning]);

  useEffect(() => {
    if (isScanning) {
      requestRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isScanning, processFrame]);

  useEffect(() => {
    let interval: any;
    if (isScanning && !isProcessing) {
      interval = setInterval(() => {
        handleAIScan();
      }, 2000); // Wait 2s after processing finishes before scanning again
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScanning, isProcessing]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Không thể truy cập camera. Vui lòng kiểm tra quyền.");
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const handleReset = () => {
    setResults([]);
  };

  const getAnswerCount = (ans: 'A' | 'B' | 'C' | 'D') => results.filter(r => r.answer === ans).length;
  const totalScanned = results.length;
  const totalStudents = classStudents.length;
  const scanPercentage = totalStudents > 0 ? Math.round((totalScanned / totalStudents) * 100) : 0;

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return `Đã mở hôm nay ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (days === 1) {
      return 'Đã tạo hôm qua';
    } else if (days < 7) {
      const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      return `Đã sửa ${weekdays[date.getDay()]}`;
    } else {
      return `Đã mở ${date.getDate()} tháng ${date.getMonth() + 1}`;
    }
  };

  // Render mobile view only if on mobile device
  if (isMobile && (view === 'mobile_recent' || view === 'mobile_classes' || view === 'mobile_library' || view === 'mobile_settings' || view === 'dashboard' || view === 'class_detail')) {
    const activeView = view === 'dashboard' ? 'mobile_recent' : view;

    const recentSets = [...questionSets].sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return (
      <div className="flex flex-col h-screen bg-white font-sans text-slate-900 overflow-hidden">
        {/* Status Bar */}
        <div className="bg-[#4A4A4A] text-white px-4 py-1 flex items-center justify-between text-[10px] font-medium">
          <div className="flex items-center gap-2">
            <span>VINAPHONE</span>
            <span>Viettel</span>
            <span className="ml-2">21:00</span>
            <div className="flex items-center gap-1 ml-2">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
               <div className="w-0.5 h-1.5 bg-white/40" />
               <div className="w-0.5 h-2 bg-white/40" />
               <div className="w-0.5 h-2.5 bg-white" />
               <div className="w-0.5 h-3 bg-white" />
            </div>
            <span className="text-[8px] font-bold">VoLTE</span>
            <span className="text-[8px] font-bold">4G+</span>
            <div className="flex items-center gap-0.5">
               <div className="w-0.5 h-1.5 bg-white/40" />
               <div className="w-0.5 h-2 bg-white/40" />
               <div className="w-0.5 h-2.5 bg-white" />
               <div className="w-0.5 h-3 bg-white" />
            </div>
            <div className="w-6 h-3 border border-white/60 rounded-sm relative flex items-center px-0.5 ml-1">
              <div className="h-full bg-white w-[93%]" />
              <span className="absolute inset-0 flex items-center justify-center text-[7px] text-black font-bold">93</span>
            </div>
          </div>
        </div>

        {activeView === 'mobile_recent' ? (
          <>
            {/* Header */}
            <div className="px-6 py-6">
              <h1 className="text-3xl font-bold text-slate-900">Gần đây</h1>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto border-t border-slate-100">
              {recentSets.length > 0 ? (
                recentSets.map((item, i) => (
                  <div 
                    key={item.id} 
                    className="flex items-center px-6 py-4 border-b border-slate-50 active:bg-slate-100 transition-colors cursor-pointer group" 
                    onClick={() => handlePlaySet(item.id)}
                  >
                    <div className="w-10 h-10 flex items-center justify-center shrink-0">
                      <Play className="w-5 h-5 text-blue-500 fill-blue-500" />
                    </div>
                    <div className="flex-1 ml-2 overflow-hidden">
                      <h3 className="font-bold text-[15px] text-slate-900 truncate">{item.title || 'Bộ câu hỏi chưa đặt tên'}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">{formatRelativeDate(item.updatedAt)}</p>
                    </div>
                    <div className="ml-4 bg-[#F0F7FF] text-[#007AFF] text-[11px] font-bold w-7 h-6 flex items-center justify-center rounded">
                      {item.questions.length}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Archive className="w-12 h-12 mb-2 opacity-20" />
                  <p className="text-sm">Chưa có bộ câu hỏi nào</p>
                </div>
              )}
            </div>
          </>
        ) : activeView === 'mobile_classes' ? (
          <>
            {/* Header */}
            <div className="px-6 py-6">
              <h1 className="text-3xl font-bold text-slate-900">Lớp học</h1>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto border-t border-slate-100">
              {categories.map((item, i) => {
                const colors = ['bg-emerald-400', 'bg-purple-400', 'bg-blue-400', 'bg-orange-400', 'bg-pink-400'];
                const colorClass = colors[i % colors.length];
                return (
                  <div 
                    key={item.id} 
                    className="flex items-center px-6 py-4 border-b border-slate-50 active:bg-slate-100 transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedClassId(item.id);
                      setView('class_detail');
                    }}
                  >
                    <div className={`w-4 h-4 rounded-full ${colorClass} shrink-0 ml-1`} />
                    <div className="flex-1 ml-6 overflow-hidden">
                      <h3 className="text-[16px] text-slate-900">{item.title}</h3>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : activeView === 'class_detail' ? (
          <>
            {/* Header */}
            <div className="px-6 py-6 flex items-center gap-4 border-b border-slate-100">
              <button onClick={() => setView('mobile_classes')} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className="text-2xl font-bold text-slate-900 truncate">
                {categories.find(c => c.id === selectedClassId)?.title || 'Chi tiết lớp học'}
              </h1>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-800">Danh sách học sinh</h3>
                  <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-bold">
                    {allStudents.filter(s => s.classId === selectedClassId).length}
                  </span>
                </div>
                <div className="space-y-3">
                  {allStudents.filter(s => s.classId === selectedClassId).map((student, idx) => (
                    <div key={student.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-400 w-5">{idx + 1}</span>
                        <span className="text-sm font-medium text-slate-700">{student.name}</span>
                      </div>
                    </div>
                  ))}
                  {allStudents.filter(s => s.classId === selectedClassId).length === 0 && (
                    <div className="text-center py-8 text-slate-400 italic text-sm">
                      Chưa có học sinh nào trong lớp này.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : activeView === 'mobile_library' ? (
          <>
            {/* Header */}
            <div className="px-6 py-6 border-b border-slate-100 flex items-center justify-between">
              <h1 className="text-3xl font-bold text-slate-900">Thư viện</h1>
              <button onClick={handleCreateNewSet} className="text-blue-500 hover:bg-blue-50 p-2 rounded-full transition-colors">
                <PlusCircle className="w-6 h-6" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-3">
              {questionSets.map(set => (
                <div 
                  key={set.id}
                  onClick={() => {
                    setCurrentSetId(set.id);
                    setCurrentSetTitle(set.title);
                    setView('editor');
                  }}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm active:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-slate-800 text-lg">{set.title}</h3>
                    <div className="w-8 h-8 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center font-bold text-sm">
                      {set.questions.length}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRecentDate(set.updatedAt)}
                    </span>
                  </div>
                </div>
              ))}
              {questionSets.length === 0 && (
                <div className="text-center py-12 text-slate-400 italic">
                  Chưa có bộ câu hỏi nào.
                </div>
              )}
            </div>
          </>
        ) : activeView === 'mobile_settings' ? (
          <>
            {/* Header */}
            <div className="px-6 py-6 border-b border-slate-100">
              <h1 className="text-3xl font-bold text-slate-900">Cài đặt</h1>
            </div>

            {/* Settings List */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-4 border-b border-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
                <h3 className="text-[15px] text-slate-900">Hiệu chỉnh máy quét</h3>
                <p className="text-[13px] text-slate-400">Mặc định</p>
              </div>
              <div 
                className="px-6 py-4 border-b border-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
                onClick={() => {
                  if (onLogout) {
                    onLogout();
                  } else {
                    onBack();
                  }
                }}
              >
                <h3 className="text-[15px] text-slate-900">Đăng xuất</h3>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-6">
              <h1 className="text-3xl font-bold text-slate-900">Thư viện</h1>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto border-t border-slate-100">
              {questionSets.length > 0 ? (
                questionSets.map((item, i) => (
                  <div 
                    key={item.id} 
                    className="flex items-center px-6 py-4 border-b border-slate-50 active:bg-slate-100 transition-colors cursor-pointer group" 
                    onClick={() => handlePlaySet(item.id)}
                  >
                    <div className="w-10 h-10 flex items-center justify-center shrink-0">
                      <Folder className="w-5 h-5 text-blue-500 fill-blue-500" />
                    </div>
                    <div className="flex-1 ml-2 overflow-hidden">
                      <h3 className="font-bold text-[15px] text-slate-900 truncate">{item.title || 'Bộ câu hỏi chưa đặt tên'}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">{item.questions.length} câu hỏi</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Folder className="w-12 h-12 mb-2 opacity-20" />
                  <p className="text-sm">Thư viện trống</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Bottom Nav */}
        <div className="bg-white border-t border-slate-100 flex items-center justify-around py-2 px-4 shrink-0">
          <button 
            onClick={() => setView('mobile_classes')}
            className={`flex flex-col items-center gap-1 ${activeView === 'mobile_classes' ? 'text-blue-500' : 'opacity-40'}`}
          >
            <Users className={`w-6 h-6 ${activeView === 'mobile_classes' ? 'fill-blue-500' : ''}`} />
            <span className="text-[10px] font-bold">Lớp học</span>
          </button>
          <button 
            onClick={() => setView('mobile_recent')}
            className={`flex flex-col items-center gap-1 ${activeView === 'mobile_recent' ? 'text-blue-500' : 'opacity-40'}`}
          >
            <div className="relative">
              <Archive className={`w-6 h-6 ${activeView === 'mobile_recent' ? 'fill-blue-500' : ''}`} />
              {activeView === 'mobile_recent' && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
              )}
            </div>
            {activeView === 'mobile_recent' && <span className="text-[10px] font-bold">Gần đây</span>}
          </button>
          <button 
            onClick={() => setView('mobile_library')}
            className={`flex flex-col items-center gap-1 ${activeView === 'mobile_library' ? 'text-blue-500' : 'opacity-40'}`}
          >
            <Folder className={`w-6 h-6 ${activeView === 'mobile_library' ? 'fill-blue-500' : ''}`} />
            {activeView === 'mobile_library' && <span className="text-[10px] font-bold">Thư viện</span>}
          </button>
          <button 
            onClick={() => setView('mobile_settings')}
            className={`flex flex-col items-center gap-1 ${activeView === 'mobile_settings' ? 'text-blue-500' : 'opacity-40'}`}
          >
            <Settings className={`w-6 h-6 ${activeView === 'mobile_settings' ? 'fill-blue-500' : ''}`} />
            {activeView === 'mobile_settings' && <span className="text-[10px] font-bold">Cài đặt</span>}
          </button>
        </div>

        {/* Android Nav */}
        <div className="bg-black py-3 flex items-center justify-around px-12 shrink-0">
          <div className="w-4 h-4 border-2 border-white/60 rounded-sm" />
          <div className="w-4 h-4 border-2 border-white/60 rounded-full" />
          <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[12px] border-r-white/60 rotate-180" />
        </div>

        {isPrinting && selectedClassId && (
          <PrintablePlickerCards 
            students={allStudents.filter(s => s.classId === selectedClassId)} 
            onClose={() => setIsPrinting(false)} 
          />
        )}

        {/* Delete Modal */}
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-800">Xóa bộ câu hỏi</h3>
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6">
                <p className="text-slate-600 mb-6">
                  Bạn có chắc chắn muốn xóa bộ câu hỏi này không? Hành động này không thể hoàn tác.
                </p>
                
                <div className="flex items-center justify-end gap-3">
                  <button 
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={confirmDeleteSet}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Play Now Modal */}
        {isPlayNowModalOpen && playNowSetId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Chơi ngay</h3>
                  <p className="text-xs text-slate-500">
                    {questionSets.find(s => s.id === playNowSetId)?.title || 'Bộ câu hỏi'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsPlayNowModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6">
                <h4 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Chọn lớp để chơi</h4>
                <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2">
                  {categories.map(c => {
                    return (
                      <button
                        key={c.id}
                        onClick={() => startPlaying(playNowSetId, c.id)}
                        className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
                      >
                        <div className={`w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-white shadow-sm`}>
                          <Users className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-slate-800 group-hover:text-blue-700">{c.title}</div>
                          <div className="text-xs text-slate-500">
                            {allStudents.filter(s => s.classId === c.id).length} học sinh
                          </div>
                        </div>
                        <Play className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                      </button>
                    );
                  })}
                  
                  {categories.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                      <p className="text-slate-500 mb-4">Bạn chưa có lớp học nào.</p>
                      <button 
                        onClick={() => {
                          setIsPlayNowModalOpen(false);
                          setIsCreateClassModalOpen(true);
                        }}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                      >
                        Tạo lớp mới
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Class Modal */}
        {isCreateClassModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-lg font-bold text-slate-800">Tạo lớp học mới</h3>
                <button 
                  onClick={() => setIsCreateClassModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                if (newClassName.trim()) {
                  const studentList = pastedStudents.split('\n').map(s => s.trim()).filter(s => s);
                  onCreateClass(newClassName.trim(), studentList);
                  setNewClassName('');
                  setPastedStudents('');
                  setIsCreateClassModalOpen(false);
                }
              }} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tên lớp học</label>
                  <input 
                    autoFocus
                    type="text" 
                    required
                    value={newClassName}
                    onChange={e => setNewClassName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder="Nhập tên lớp..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Danh sách học sinh (tùy chọn)</label>
                  <p className="text-xs text-slate-500 mb-2">Copy cột tên học sinh từ Excel và dán vào đây (mỗi dòng 1 học sinh).</p>
                  <textarea
                    value={pastedStudents}
                    onChange={e => setPastedStudents(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all min-h-[150px] resize-y"
                    placeholder="Nguyễn Văn A&#10;Trần Thị B&#10;Lê Văn C..."
                  />
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setIsCreateClassModalOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Tạo lớp
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'dashboard' || view === 'recent' || view === 'reports' || view === 'report_detail' || view === 'question_detail' || view === 'scoreboard' || (view as any) === 'class_detail' || view === 'student_cards') {
    return (
      <div className="flex flex-col h-screen bg-white font-sans">
        {/* Top Bar */}
        {view === 'scoreboard' ? (
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white z-10 h-14">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('dashboard')} className="w-10 h-10 border border-slate-200 rounded flex items-center justify-center hover:bg-slate-50 shadow-sm">
                <Home className="w-6 h-6 text-blue-500 fill-blue-500" />
              </button>
              <span className="ml-4 text-xl font-bold text-slate-800">Bảng điểm</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Báo cáo của sinh viên" 
                  className="pl-3 pr-3 py-2 border border-slate-200 rounded text-sm w-56 focus:outline-none focus:border-blue-500 bg-white"
                />
              </div>
              <div className="flex items-center gap-1">
                <button className="p-2 hover:bg-slate-100 rounded text-slate-400">
                  <LayoutGrid className="w-5 h-5" />
                </button>
                <button className="p-2 hover:bg-slate-100 rounded text-slate-400">
                  <Upload className="w-5 h-5" />
                </button>
                <button className="p-2 hover:bg-slate-100 rounded text-slate-400">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center px-4 py-2 border-b border-slate-200 bg-white z-10">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="text-slate-500 hover:text-slate-700">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-8 h-8 bg-[#1DA1F2] rounded flex items-center justify-center text-white">
                <Check className="w-5 h-5 stroke-[3]" />
              </div>
              <button 
                onClick={() => setView('scanner')}
                className="px-6 py-1.5 border border-slate-300 rounded text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                Đang phát
              </button>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Tìm kiếm" 
                  className="pl-3 pr-3 py-1.5 border border-slate-300 rounded text-sm w-64 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-[#F8F9FA] border-r border-slate-200 flex flex-col py-4 overflow-y-auto">
            {view !== 'scoreboard' && (
              <div className="space-y-0.5 px-2">
                <SidebarItem icon={<Edit className="w-4 h-4" />} label="Bộ mới" onClick={handleCreateNewSet} />
                <SidebarItem icon={<Clock className={`w-4 h-4 ${view === 'recent' ? 'text-blue-500 fill-blue-500' : ''}`} />} label="Gần đây" active={view === 'recent'} onClick={() => setView('recent')} />
                {isMobile && (
                  <SidebarItem icon={<Archive className={`w-4 h-4 ${(view as any) === 'mobile_recent' ? 'text-blue-500 fill-blue-500' : ''}`} />} label="Mobile Recent" active={(view as any) === 'mobile_recent'} onClick={() => setView('mobile_recent')} />
                )}
                <SidebarItem icon={<Folder className={`w-4 h-4 ${(view as any) === 'dashboard' ? 'text-blue-500 fill-blue-500' : ''}`} />} label="Thư viện của bạn" active={(view as any) === 'dashboard'} onClick={() => setView('dashboard')} />
                <SidebarItem icon={<FileText className={`w-4 h-4 ${(view as any) === 'reports' ? 'text-blue-500 fill-blue-500' : ''}`} />} label="Báo cáo" active={(view as any) === 'reports'} onClick={() => setView('reports')} />
                <SidebarItem icon={<Grid className={`w-4 h-4 ${(view as any) === 'scoreboard' ? 'text-blue-500 fill-blue-500' : ''}`} />} label="Bảng điểm" active={(view as any) === 'scoreboard'} onClick={() => setView('scoreboard')} />
                <SidebarItem icon={<Printer className={`w-4 h-4 ${view === 'student_cards' ? 'text-blue-500 fill-blue-500' : ''}`} />} label="Thẻ học sinh" active={view === 'student_cards'} onClick={() => setView('student_cards')} />
              </div>
            )}

            <div className={`${(view as any) === 'scoreboard' ? 'mt-4' : 'mt-6'} px-4`}>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                {(view as any) === 'scoreboard' ? 'Bảng điểm lớp học' : 'Các lớp học của bạn'}
              </h3>
              <div className="space-y-2">
                {categories.map((c, i) => {
                  const colors = ['bg-emerald-500', 'bg-purple-500', 'bg-blue-500', 'bg-orange-500', 'bg-pink-500'];
                  const colorClass = colors[i % colors.length];
                  const isSelected = selectedClassId === c.id;
                  
                  return (
                    <div key={c.id} className="space-y-1">
                      <div 
                        className={`flex items-center gap-3 px-2 py-1.5 text-base hover:bg-slate-200 rounded cursor-pointer font-medium transition-all ${isSelected && ((view as any) === 'scoreboard' || (view as any) === 'class_detail') ? 'bg-[#2ECC71] text-white shadow-sm' : 'text-slate-800'}`}
                        onClick={() => {
                          setSelectedClassId(c.id);
                          if ((view as any) !== 'scoreboard') {
                            setView('class_detail');
                            setIsScanning(false);
                          }
                        }}
                      >
                        <div className={`w-3 h-3 rounded-full ${isSelected && ((view as any) === 'scoreboard' || (view as any) === 'class_detail') ? 'bg-white' : colorClass}`} />
                        <span className="truncate flex-1">{c.title}</span>
                        {isSelected && (view as any) === 'scoreboard' && <ChevronRight className="w-4 h-4 text-white/70" />}
                      </div>
                      
                      {/* Nested student list in sidebar for scoreboard view */}
                      {isSelected && (view as any) === 'scoreboard' && (
                        <div className="pl-6 py-1 space-y-0.5 max-h-[200px] overflow-y-auto custom-scrollbar">
                          {allStudents.filter(s => s.classId === c.id).map(student => {
                            const getScore = (seed: string) => {
                              let hash = 0;
                              for (let i = 0; i < seed.length; i++) {
                                hash = ((hash << 5) - hash) + seed.charCodeAt(i);
                                hash |= 0;
                              }
                              return Math.abs(hash % 101);
                            };
                            const score = getScore(student.id + "total");
                            return (
                              <div key={student.id} className="flex items-center justify-between text-[11px] text-slate-500 py-0.5 pr-2">
                                <span className="truncate w-24">{student.name}</span>
                                <span className={`font-bold ${score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-blue-500' : 'text-red-400'}`}>
                                  {score}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {view !== 'scoreboard' && (
                  <div 
                    className="flex items-center gap-3 px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-200 rounded cursor-pointer"
                    onClick={() => setIsCreateClassModalOpen(true)}
                  >
                    <PlusCircle className="w-4 h-4 text-slate-400" />
                    <span>Lớp mới</span>
                  </div>
                )}
              </div>
            </div>
            
            {view !== 'scoreboard' && (
              <div className="mt-4 px-4">
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded cursor-pointer">
                  <span>Gói mới</span>
                </div>
              </div>
            )}

            {view === 'scoreboard' && (
              <div className="mt-auto p-4 border-t border-slate-200 overflow-y-auto max-h-[300px]">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Bộ câu hỏi đã tạo</h3>
                <div className="space-y-1">
                  {questionSets.map(set => (
                    <div 
                      key={set.id}
                      onClick={() => setSelectedScoreboardSetId(set.id)}
                      className={`flex items-center gap-2 px-2 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors ${
                        selectedScoreboardSetId === set.id ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <FileText className={`w-3 h-3 ${selectedScoreboardSetId === set.id ? 'text-white' : 'text-slate-400'}`} />
                      <span className="truncate">{set.title}</span>
                    </div>
                  ))}
                  {questionSets.length === 0 && (
                    <div className="text-[10px] text-slate-400 italic px-2">Chưa có bộ câu hỏi nào</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto bg-white flex flex-col">
            {view === 'scoreboard' ? (
              selectedClassId ? (
                <div className="flex-1 flex flex-col">
                  <div className="border-b border-slate-200 bg-white sticky top-0 z-20">
                    <div className="px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-slate-800">
                          {categories.find(c => c.id === selectedClassId)?.title}
                        </h2>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-medium rounded-full">
                          {allStudents.filter(s => s.classId === selectedClassId).length} học sinh
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative mr-2">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input 
                            type="text" 
                            placeholder="Tìm học sinh..." 
                            className="pl-9 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-48 transition-all"
                          />
                        </div>
                        <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                          <Download className="w-4 h-4" />
                          Xuất Excel
                        </button>
                        <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                          <Printer className="w-4 h-4" />
                          In
                        </button>
                      </div>
                    </div>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-t border-slate-200">
                          <th className="text-left p-3 pl-6 font-bold text-slate-600 border-r border-slate-200 w-64">
                            <div className="flex items-center gap-1 cursor-pointer hover:text-slate-800">
                              Học sinh <ChevronUp className="w-3 h-3 text-slate-400" />
                            </div>
                          </th>
                          {/* Question columns */}
                          {(() => {
                            const selectedSet = questionSets.find(s => s.id === selectedScoreboardSetId);
                            const questionCount = selectedSet ? selectedSet.questions.length : 5;
                            return [...Array(questionCount)].map((_, i) => (
                              <th key={i} className="text-center p-3 font-medium border-r border-slate-200 text-xs min-w-[80px] text-slate-500">
                                <div className="flex flex-col">
                                  <span>Câu {i + 1}</span>
                                </div>
                              </th>
                            ));
                          })()}
                          <th className="text-right p-3 pr-6 font-bold text-slate-600 w-24">
                            <div className="flex flex-col items-end leading-tight text-[11px] uppercase tracking-wider">
                              <span>Tổng</span>
                              <span>cộng</span>
                            </div>
                          </th>
                        </tr>
                      </thead>
                    </table>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full border-collapse">
                      <tbody>
                        {(() => {
                          const getScore = (seed: string) => {
                            let hash = 0;
                            for (let i = 0; i < seed.length; i++) {
                              hash = ((hash << 5) - hash) + seed.charCodeAt(i);
                              hash |= 0;
                            }
                            return Math.abs(hash % 101);
                          };

                          const filteredStudents = allStudents.filter(s => s.classId === selectedClassId);
                          
                          if (filteredStudents.length > 0) {
                            return filteredStudents.map((student, idx) => {
                              const totalScore = getScore(student.id + "total");
                              const scoreColor = totalScore >= 80 ? 'text-emerald-600' : totalScore >= 50 ? 'text-blue-600' : 'text-red-500';
                              
                              return (
                                <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
                                  <td className="p-3 pl-6 text-sm text-slate-800 font-medium border-r border-slate-200 w-64">
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs text-slate-400 w-4">{idx + 1}</span>
                                      {student.name}
                                    </div>
                                  </td>
                                  {/* Mock daily scores */}
                                  {(() => {
                                    const selectedSet = questionSets.find(s => s.id === selectedScoreboardSetId);
                                    const questionCount = selectedSet ? selectedSet.questions.length : 5;
                                    return [...Array(questionCount)].map((_, i) => {
                                      const dayScore = getScore(student.id + i);
                                      const dayColor = dayScore >= 80 ? 'text-emerald-500' : dayScore >= 50 ? 'text-blue-500' : 'text-slate-400';
                                      return (
                                        <td key={i} className="p-3 text-center text-sm border-r border-slate-200 min-w-[80px]">
                                          <span className={dayColor}>{dayScore > 0 ? dayScore + '%' : '-'}</span>
                                        </td>
                                      );
                                    });
                                  })()}
                                  <td className="p-3 pr-6 text-right w-24">
                                    <div className="flex flex-col items-end">
                                      <span className={`text-sm font-bold ${scoreColor}`}>{totalScore}%</span>
                                      <div className="w-12 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                        <div 
                                          className={`h-full ${totalScore >= 80 ? 'bg-emerald-500' : totalScore >= 50 ? 'bg-blue-500' : 'bg-red-400'}`} 
                                          style={{ width: `${totalScore}%` }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            });
                          }
                          return null;
                        })()}
                        {allStudents.filter(s => s.classId === selectedClassId).length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-12 text-center text-slate-400 italic">
                              <div className="flex flex-col items-center gap-2">
                                <Users className="w-12 h-12 text-slate-200" />
                                <span>Chưa có học sinh trong lớp này</span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex-1 p-8">
                  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                    <h1 className="text-[44px] font-bold text-slate-300 mb-4">Chào mừng đến với Bảng điểm!</h1>
                    <p className="text-lg font-medium text-slate-500 mb-12">Hãy chọn một lớp học ở bên trái để bắt đầu.</p>
                  </div>
                </div>
              )
            ) : (
              <div className={`w-full h-full flex flex-col ${(view as any) === 'class_detail' ? '' : 'p-8'}`}>
                {view === 'question_detail' && selectedReportId && selectedQuestionId ? (() => {
                const set = questionSets.find(s => s.id === selectedReportId);
                if (!set) return <div>Không tìm thấy báo cáo</div>;
                
                const question = set.questions.find(q => q.id === selectedQuestionId);
                if (!question) return <div>Không tìm thấy câu hỏi</div>;

                const date = new Date(set.updatedAt);
                const day = date.getDate();
                const month = date.getMonth() + 1;
                const year = date.getFullYear();
                const hours = date.getHours();
                const minutes = date.getMinutes();
                const ampm = hours >= 12 ? 'chiều' : 'sáng';
                const formattedHours = hours % 12 || 12;
                const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
                
                const dayOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][date.getDay()];
                
                const fullDateStr = `${dayOfWeek}, ngày ${day} tháng ${month} năm ${year}, ${formattedHours}:${formattedMinutes} ${ampm}`;
                
                const classId = categories.length > 0 ? categories[0].id : null;
                const className = categories.length > 0 ? categories[0].title : 'Chưa gán lớp';
                const classStudents = classId ? allStudents.filter(s => s.classId === classId) : [];
                
                const qScore = 0; 
                
                const answers = {
                  A: { count: 0, students: [] as string[] },
                  B: { count: 0, students: [] as string[] },
                  C: { count: 0, students: [] as string[] },
                  D: { count: 0, students: [] as string[] },
                  Missing: { count: classStudents.length, students: classStudents.map(s => s.name) }
                };

                const maxCount = Math.max(
                  answers.A.count,
                  answers.B.count,
                  answers.C.count,
                  answers.D.count,
                  1 // Prevent division by zero
                );

                return (
                  <div className="w-full">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => setView('report_detail')}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <ChevronLeft className="w-8 h-8" />
                        </button>
                        <div>
                          <h1 className="text-4xl font-bold text-slate-800 mb-4">{question.text || 'Chưa có nội dung câu hỏi'}</h1>
                          <div className="flex items-center gap-2 text-lg text-slate-700">
                            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                            <span>{className}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-3xl font-bold text-slate-700">
                        <div className="w-3 h-3 rounded-full bg-red-400"></div>
                        {qScore} %
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-slate-500 text-lg mb-8 pb-4 border-b border-slate-200">
                      <div>{fullDateStr}</div>
                      <button className="text-blue-500 hover:bg-blue-50 p-2 rounded-full">
                        <MoreHorizontal className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="space-y-8">
                      {['A', 'B', 'C', 'D'].map((opt, idx) => {
                        const data = answers[opt as keyof typeof answers];
                        const isCorrect = opt === 'C'; // Mock correct answer
                        const barColor = isCorrect ? 'bg-emerald-500' : 'bg-red-400';
                        const textColor = isCorrect ? 'text-emerald-500' : 'text-red-400';
                        const borderColor = isCorrect ? 'border-emerald-500' : 'border-red-400';
                        
                        // Calculate width percentage relative to max count
                        const widthPercent = (data.count / maxCount) * 100;

                        return (
                          <div key={opt} className="flex gap-6">
                            <div className={`w-10 h-10 rounded border-2 flex items-center justify-center text-xl font-bold shrink-0 ${borderColor} ${textColor}`}>
                              {opt}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-4 mb-4">
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full ${barColor}`} style={{ width: `${widthPercent}%` }}></div>
                                </div>
                                <div className="text-2xl font-bold text-slate-600 w-8 text-right">{data.count}</div>
                              </div>
                              <div className="grid grid-cols-4 gap-y-2 text-sm text-slate-700">
                                {data.students.map((student, i) => (
                                  <div key={i}>{student}</div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Missing section */}
                      <div className="flex gap-6 pt-8 border-t border-slate-100">
                        <div className="w-10 shrink-0"></div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-slate-600">Missing</h3>
                            <div className="text-2xl font-bold text-slate-600 w-8 text-right">{answers.Missing.count}</div>
                          </div>
                          <div className="grid grid-cols-4 gap-y-2 text-sm text-slate-700">
                            {answers.Missing.students.map((student, i) => (
                              <div key={i}>{student}</div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })() : view === 'report_detail' && selectedReportId ? (() => {
                const set = questionSets.find(s => s.id === selectedReportId);
                if (!set) return <div>Không tìm thấy báo cáo</div>;
                
                const date = new Date(set.updatedAt);
                const day = date.getDate();
                const month = date.getMonth() + 1;
                const year = date.getFullYear();
                const hours = date.getHours();
                const minutes = date.getMinutes();
                const ampm = hours >= 12 ? 'chiều' : 'sáng';
                const formattedHours = hours % 12 || 12;
                const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
                
                const dayOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][date.getDay()];
                
                const fullDateStr = `Trận đấu diễn ra vào ${dayOfWeek}, ngày ${day} tháng ${month} năm ${year}, lúc ${formattedHours}:${formattedMinutes} ${ampm}.`;
                
                const className = categories.length > 0 ? categories[0].title : 'Chưa gán lớp';
                
                // Mock overall score
                const overallScore = 0; // We can use a random or fixed value for now, or calculate if we had real data

                return (
                  <div className="w-full">
                    <button 
                      onClick={() => setView('reports')}
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-8"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Trở lại mục Báo cáo
                    </button>

                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h1 className="text-4xl font-bold text-slate-800 mb-4">{set.title}</h1>
                        <div className="flex items-center gap-2 text-lg text-slate-700">
                          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                          <span>{className}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-3xl font-bold text-slate-700">
                        <div className="w-3 h-3 rounded-full bg-red-400"></div>
                        {overallScore} %
                      </div>
                    </div>

                    <div className="text-slate-500 text-lg mb-8 pb-8 border-b border-slate-200">
                      {fullDateStr}
                    </div>

                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-bold text-slate-600 uppercase">CÂU HỎI</h2>
                      <div className="flex items-center gap-4 text-sm font-bold text-slate-400">
                        <button className="text-blue-500">TẤT CẢ</button>
                        <button className="hover:text-slate-600">ĐÃ TRẢ LỜI</button>
                        <button className="p-1 hover:bg-slate-100 rounded">
                          <LayoutGrid className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {set.questions.map((q, idx) => {
                        // Mock individual question score
                        const qScore = 0;
                        
                        return (
                          <div 
                            key={q.id} 
                            className="bg-white border border-slate-200 rounded-md shadow-sm flex flex-col p-4 cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => {
                              setSelectedQuestionId(q.id);
                              setView('question_detail');
                            }}
                          >
                            <div className="flex justify-between items-start mb-8 gap-4">
                              <div className="text-sm font-medium text-slate-800 line-clamp-3">
                                {q.text || 'Chưa có nội dung câu hỏi'}
                              </div>
                              <div className="bg-red-400 text-white text-sm font-bold px-2 py-1 rounded shrink-0">
                                {qScore} %
                              </div>
                            </div>
                            <div className="mt-auto flex gap-3 justify-between px-2">
                              {['A', 'B', 'C', 'D'].map((opt, i) => (
                                <div key={opt} className="flex-1 flex flex-col items-center gap-2">
                                  <div className="w-full aspect-[4/3] border border-slate-100 rounded-sm bg-slate-50"></div>
                                  <div className={`text-xs font-bold w-full text-center pb-1 ${i === 0 ? 'text-red-400 border-b-2 border-red-400' : i === 2 ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-slate-400'}`}>
                                    {opt}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })() : view === 'reports' ? (
                <>
                  <div className="flex items-center gap-3 mb-8">
                    <FileText className="w-8 h-8 text-blue-500 fill-blue-500" />
                    <h1 className="text-3xl font-bold text-slate-800">Báo cáo</h1>
                  </div>

                  <div className="flex items-center justify-between mb-8 gap-4">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Lọc" 
                        className="pl-9 pr-4 py-2.5 bg-[#F5F6F8] border-none rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                      />
                    </div>
                    <button className="p-2 hover:bg-slate-50 rounded-full text-blue-500 shrink-0">
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-10">
                    {Object.entries(groupedReports).map(([monthYear, reports]) => (
                      <div key={monthYear}>
                        <h2 className="text-lg font-bold text-slate-400 mb-4">{monthYear}</h2>
                        <div className="space-y-4">
                          {(reports as any[]).map(report => (
                            <div 
                              key={report.id} 
                              className="flex items-center gap-6 group cursor-pointer"
                              onClick={() => {
                                setSelectedReportId(report.id);
                                setView('report_detail');
                              }}
                            >
                              {/* Thumbnail */}
                              <div className="w-64 h-36 bg-white border border-slate-200 rounded-md shadow-sm relative overflow-hidden flex flex-col p-3 shrink-0">
                                <div className="text-xs font-medium text-slate-800 mb-2 line-clamp-2 pr-12">
                                  {report.thumbnailText}
                                </div>
                                <div className="mt-auto flex gap-1 justify-between">
                                  {['A', 'B', 'C', 'D'].map((opt, i) => (
                                    <div key={opt} className="flex-1 flex flex-col items-center gap-1">
                                      <div className="w-full h-8 border border-slate-100 rounded-sm bg-slate-50"></div>
                                      <div className={`text-[10px] font-bold ${i === 0 ? 'text-red-400 border-b-2 border-red-400' : i === 2 ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-slate-400'}`}>
                                        {opt}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {/* Score Badge */}
                                <div className="absolute top-2 right-2 bg-red-400 text-white text-xs font-bold px-2 py-1 rounded">
                                  {report.scorePercentage} %
                                </div>
                              </div>

                              {/* Info */}
                              <div className="flex-1">
                                <h3 className="text-xl font-bold text-slate-800 mb-2">{report.title}</h3>
                                <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                                  <span className="font-medium text-slate-700">{report.className}</span>
                                  <span>{report.dateStr}</span>
                                </div>
                                <div className="flex gap-1">
                                  {Array.from({ length: report.questionCount }).map((_, i) => (
                                    <div key={i} className="w-6 h-1.5 bg-slate-200 rounded-sm"></div>
                                  ))}
                                </div>
                              </div>

                              {/* Chevron */}
                              <div className="text-slate-300 group-hover:text-slate-500 transition-colors">
                                <ChevronRight className="w-6 h-6" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (view as any) === 'class_detail' ? (
                <div className="flex-1 flex flex-col">
                  {/* Class Header */}
                  <div className="px-8 py-6 border-b border-slate-200">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-emerald-500 rounded-lg flex items-center justify-center text-white text-2xl font-bold">
                        {categories.find(c => c.id === selectedClassId)?.title?.charAt(0) || 'C'}
                      </div>
                      <h1 className="text-3xl font-bold text-slate-800">
                        {categories.find(c => c.id === selectedClassId)?.title || 'Lớp học'}
                      </h1>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-8 border-b border-transparent">
                      {[
                        { id: 'playing', label: 'ĐANG TIẾN HÀNH' },
                        { id: 'next', label: 'Tiếp theo' },
                        { id: 'upcoming', label: 'Sắp tới' },
                        { id: 'reports', label: 'Báo cáo mới nhất' },
                        { id: 'students', label: 'Học sinh' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveClassTab(tab.id as any)}
                          className={`pb-4 text-sm font-bold tracking-wider transition-all relative ${
                            activeClassTab === tab.id 
                              ? 'text-blue-500' 
                              : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          {tab.label}
                          {activeClassTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 rounded-t-full" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 p-8 bg-slate-50/30 overflow-y-auto">
                    {activeClassTab === 'playing' && (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-6">
                          <LayoutGrid className="w-10 h-10 text-slate-300" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Không có bộ câu hỏi nào đang phát</h2>
                        <p className="text-slate-500">Vui lòng thêm bộ câu hỏi vào hàng đợi của lớp học này.</p>
                      </div>
                    )}
                    {activeClassTab === 'next' && (
                      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                        <p className="text-slate-500 italic">Chưa có nội dung cho mục Tiếp theo</p>
                      </div>
                    )}
                    {activeClassTab === 'upcoming' && (
                      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                        <p className="text-slate-500 italic">Chưa có nội dung cho mục Sắp tới</p>
                      </div>
                    )}
                    {activeClassTab === 'reports' && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-bold text-slate-700 mb-4">Báo cáo gần đây</h3>
                        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                          {questionSets.slice(0, 3).map(set => (
                            <div key={set.id} className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded flex items-center justify-center font-bold">
                                  {set.questions.length}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-800">{set.title}</div>
                                  <div className="text-xs text-slate-500">{formatRecentDate(set.updatedAt)}</div>
                                </div>
                              </div>
                              <BarChart3 className="w-5 h-5 text-slate-300" />
                            </div>
                          ))}
                          {questionSets.length === 0 && (
                            <div className="p-8 text-center text-slate-400 italic">Chưa có báo cáo nào</div>
                          )}
                        </div>
                      </div>
                    )}
                    {activeClassTab === 'students' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-bold text-slate-700">Danh sách học sinh ({allStudents.filter(s => s.classId === selectedClassId).length})</h3>
                          <button 
                            onClick={() => setIsAddStudentModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors shadow-sm"
                          >
                            <UserPlus className="w-4 h-4" /> Thêm học sinh
                          </button>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider w-16">STT</th>
                                <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Họ và tên</th>
                                <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {allStudents.filter(s => s.classId === selectedClassId).map((student, idx) => (
                                <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 text-sm text-slate-500">{idx + 1}</td>
                                  <td className="px-6 py-4 text-sm font-medium text-slate-800">{student.name}</td>
                                  <td className="px-6 py-4 text-right">
                                    <button className="text-slate-400 hover:text-slate-600 p-1">
                                      <Edit className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {allStudents.filter(s => s.classId === selectedClassId).length === 0 && (
                                <tr>
                                  <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">
                                    Chưa có học sinh nào trong lớp này.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : view === 'student_cards' ? (
                <div className="p-8 max-w-6xl mx-auto w-full">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <Printer className="w-8 h-8 text-[#1DA1F2] fill-[#1DA1F2]" />
                      <h1 className="text-3xl font-bold text-slate-800">Thẻ học sinh</h1>
                    </div>
                    {selectedClassId && (
                      <button 
                        onClick={() => setIsPrinting(true)}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md flex items-center gap-2"
                      >
                        <Printer className="w-5 h-5" />
                        In tất cả thẻ
                      </button>
                    )}
                  </div>

                  {!selectedClassId ? (
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
                      <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                      <h2 className="text-xl font-bold text-slate-700 mb-2">Chưa chọn lớp học</h2>
                      <p className="text-slate-500 mb-8 max-w-md mx-auto">Vui lòng chọn một lớp học từ menu bên trái để xem và in thẻ Plicker cho học sinh.</p>
                      <div className="flex flex-wrap justify-center gap-3">
                        {categories.map(c => (
                          <button 
                            key={c.id}
                            onClick={() => setSelectedClassId(c.id)}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:border-blue-500 hover:text-blue-500 transition-all"
                          >
                            {c.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="flex items-center justify-between bg-blue-50 p-6 rounded-2xl border border-blue-100">
                        <div>
                          <h2 className="text-xl font-bold text-slate-800">Lớp: {categories.find(c => c.id === selectedClassId)?.title}</h2>
                          <p className="text-slate-600">Tổng số {allStudents.filter(s => s.classId === selectedClassId).length} học sinh. Mỗi học sinh được gán với một số thẻ cố định.</p>
                        </div>
                        <div className="text-blue-600 font-bold bg-white px-4 py-2 rounded-lg shadow-sm">
                          {allStudents.filter(s => s.classId === selectedClassId).length} thẻ
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {allStudents.filter(s => s.classId === selectedClassId).map((student, index) => {
                          const studentNumber = index + 1;
                          const grid = Array(5).fill(0).map(() => Array(5).fill(true));
                          const hash = (studentNumber * 137 + 21) % 512;
                          for (let i = 1; i < 4; i++) {
                            for (let j = 1; j < 4; j++) {
                              const bit = 1 << ((i - 1) * 3 + (j - 1));
                              if ((hash & bit) !== 0) {
                                grid[i][j] = false;
                              }
                            }
                          }
                          grid[1][1] = false;
                          grid[1][3] = true;
                          grid[3][1] = true;
                          grid[3][3] = false;
                          grid[2][2] = false;

                          return (
                            <div key={student.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col items-center">
                              <div className="w-full flex justify-between items-start mb-6">
                                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold">Thẻ #{studentNumber}</span>
                                <button className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                              
                              <h3 className="font-bold text-slate-800 mb-6 text-lg">{student.name}</h3>
                              
                              <div className="relative w-40 h-40 border-4 border-black mb-4 flex shrink-0">
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-400">B</div>
                                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-400 rotate-180">D</div>
                                <div className="absolute top-1/2 -left-6 -translate-y-1/2 text-[10px] font-bold text-slate-400 -rotate-90">A</div>
                                <div className="absolute top-1/2 -right-6 -translate-y-1/2 text-[10px] font-bold text-slate-400 rotate-90">C</div>
                                
                                <div className="w-full h-full grid grid-cols-5 grid-rows-5 bg-white">
                                  {grid.map((row, i) => 
                                    row.map((isBlack, j) => (
                                      <div key={`${i}-${j}`} className={isBlack ? 'bg-black' : 'bg-white'} />
                                    ))
                                  )}
                                </div>
                              </div>
                              
                              <p className="text-[10px] text-slate-400 mt-2 italic text-center">Gần giơ thẻ với cạnh đáp án ở phía trên để chọn</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : view === 'dashboard' ? (
                <>
                  <div className="flex items-center gap-3 mb-8">
                    <Folder className="w-8 h-8 text-[#1DA1F2] fill-[#1DA1F2]" />
                    <h1 className="text-3xl font-bold text-slate-800">Thư viện của bạn</h1>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Lọc" 
                        className="pl-9 pr-4 py-2 bg-slate-50 border-none rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
                      />
                    </div>
                    <div className="flex items-center gap-4 text-sm font-medium text-[#1DA1F2]">
                      <button className="hover:underline" onClick={handleCreateNewSet}>Gói mới</button>
                      <button className="flex items-center gap-1 hover:underline" onClick={handleCreateNewSet}>
                        <Edit className="w-4 h-4" /> Bộ mới
                      </button>
                      <button className="p-1 hover:bg-blue-50 rounded"><Folder className="w-5 h-5" /></button>
                      <button className="p-1 hover:bg-blue-50 rounded"><MoreHorizontal className="w-5 h-5" /></button>
                    </div>
                  </div>

                  <div className="border-t border-slate-200">
                    <div className="flex items-center px-4 py-2 text-[11px] font-bold text-slate-400 border-b border-slate-200 uppercase tracking-wider">
                      <div className="flex-1">Tên</div>
                      <div className="w-48 text-right">Đã sửa đổi</div>
                    </div>
                    {questionSets.map(set => (
                      <div 
                        key={set.id}
                        onClick={() => handlePlaySet(set.id)}
                        className="flex items-center px-4 py-3 border-b border-slate-100 hover:bg-[#1DA1F2] hover:text-white cursor-pointer group transition-colors"
                      >
                        <div className="flex-1 flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-50 text-blue-500 font-bold text-sm flex items-center justify-center rounded shrink-0 group-hover:bg-transparent group-hover:text-white transition-colors">
                            <div className="group-hover:hidden">{set.questions.length}</div>
                            <Play 
                              className="w-5 h-5 hidden group-hover:block fill-white" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlaySet(set.id);
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium truncate">{set.title || 'Bộ không tên'}</span>
                        </div>
                        <div className="w-48 text-right text-sm text-slate-500 group-hover:text-white/90 flex items-center justify-end gap-1">
                          <span className="mr-3">{formatRecentDate(set.updatedAt)}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenSet(set.id);
                              }}
                              className="p-2 text-slate-400 hover:text-white hover:bg-white/20 rounded"
                              title="Chỉnh sửa bộ câu hỏi"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => handleDeleteSet(e, set.id)}
                              className="p-2 text-slate-400 hover:text-white hover:bg-red-500/50 rounded"
                              title="Xóa bộ câu hỏi"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {questionSets.length === 0 && (
                      <div className="text-center py-12 text-slate-500">
                        Thư viện trống. Hãy tạo một bộ câu hỏi mới!
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-8">
                    <Archive className="w-8 h-8 text-[#1DA1F2] fill-[#1DA1F2]" />
                    <h1 className="text-3xl font-bold text-slate-800">Gần đây</h1>
                  </div>

                  <div className="flex items-center justify-between mb-8">
                    <div className="relative flex-1 bg-slate-50 rounded-md flex items-center">
                      <Search className="w-4 h-4 ml-3 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Lọc" 
                        className="w-full pl-2 pr-4 py-2.5 bg-transparent border-none text-sm focus:outline-none text-slate-700"
                      />
                    </div>
                    <div className="flex items-center gap-6 text-sm font-medium text-[#1DA1F2] ml-4">
                      <button className="hover:underline" onClick={handleCreateNewSet}>Gói mới</button>
                      <button className="flex items-center gap-1 hover:underline" onClick={handleCreateNewSet}>
                        <Edit className="w-4 h-4" /> Bộ mới
                      </button>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {Object.entries(groupQuestionSets()).map(([groupName, sets]) => {
                      if (sets.length === 0) return null;
                      return (
                        <div key={groupName}>
                          <h2 className="text-sm font-bold text-slate-500 mb-4">{groupName}</h2>
                          <div className="border-t border-slate-200">
                            {sets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((set) => (
                              <div 
                                key={set.id}
                                onClick={() => handlePlaySet(set.id)}
                                className="flex items-center py-3 border-b border-slate-100 hover:bg-[#1DA1F2] hover:text-white cursor-pointer group transition-colors px-4"
                              >
                                <div className="w-8 h-8 bg-blue-50 text-blue-500 font-bold text-sm flex items-center justify-center rounded mr-4 shrink-0 group-hover:bg-transparent group-hover:text-white transition-colors">
                                  <div className="group-hover:hidden">{set.questions.length}</div>
                                  <Play 
                                    className="w-5 h-5 hidden group-hover:block fill-white" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePlaySet(set.id);
                                    }}
                                  />
                                </div>
                                <div className="w-1/2 text-sm font-medium pr-4 truncate">{set.title || 'Bộ không tên'}</div>
                                <div className="flex-1 text-sm text-slate-500 group-hover:text-white/90 flex items-center justify-between">
                                  <span>{formatRecentDate(set.updatedAt)}</span>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenSet(set.id);
                                      }}
                                      className="p-2 text-slate-400 hover:text-white hover:bg-white/20 rounded"
                                      title="Chỉnh sửa bộ câu hỏi"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={(e) => handleDeleteSet(e, set.id)}
                                      className="p-2 text-slate-400 hover:text-white hover:bg-red-500/50 rounded"
                                      title="Xóa bộ câu hỏi"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {questionSets.length === 0 && (
                      <div className="text-center py-12 text-slate-500">
                        Chưa có bộ câu hỏi nào. Hãy tạo một bộ mới!
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
        
        {/* Delete Set Modal */}
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-800">Xóa bộ câu hỏi</h3>
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6">
                <p className="text-slate-600 mb-6">
                  Bạn có chắc chắn muốn xóa bộ câu hỏi này không? Hành động này không thể hoàn tác.
                </p>
                
                <div className="flex items-center justify-end gap-3">
                  <button 
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={confirmDeleteSet}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Play Now Modal */}
        {isPlayNowModalOpen && playNowSetId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Chơi ngay</h3>
                  <p className="text-xs text-slate-500">
                    {questionSets.find(s => s.id === playNowSetId)?.title || 'Bộ câu hỏi'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsPlayNowModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6">
                <h4 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Chọn lớp để chơi</h4>
                <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2">
                  {categories.map(c => {
                    return (
                      <button
                        key={c.id}
                        onClick={() => startPlaying(playNowSetId, c.id)}
                        className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
                      >
                        <div className={`w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-white shadow-sm`}>
                          <Users className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-slate-800 group-hover:text-blue-700">{c.title}</div>
                          <div className="text-xs text-slate-500">
                            {allStudents.filter(s => s.classId === c.id).length} học sinh
                          </div>
                        </div>
                        <Play className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                      </button>
                    );
                  })}
                  
                  {categories.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                      <p className="text-slate-500 mb-4">Bạn chưa có lớp học nào.</p>
                      <button 
                        onClick={() => {
                          setIsPlayNowModalOpen(false);
                          setIsCreateClassModalOpen(true);
                        }}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                      >
                        Tạo lớp mới
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Print Cards Modal */}
        {isPrintModalOpen && selectedClassId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">In thẻ Plicker</h3>
                <button 
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6">
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                    <Printer className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800 mb-2">Sẵn sàng in thẻ?</h4>
                  <p className="text-sm text-slate-500">
                    Hệ thống sẽ tạo trang in cho {allStudents.filter(s => s.classId === selectedClassId).length} học sinh lớp {categories.find(c => c.id === selectedClassId)?.title}.
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsPrintModalOpen(false)}
                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={() => {
                      setIsPrintModalOpen(false);
                      setIsPrinting(true);
                    }}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Tiếp tục
                  </button>
                </div>
              </div>
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
              <form onSubmit={(e) => {
                e.preventDefault();
                if (newClassName.trim()) {
                  const studentList = pastedStudents.split('\n').map(s => s.trim()).filter(s => s);
                  onCreateClass(newClassName.trim(), studentList);
                  setNewClassName('');
                  setPastedStudents('');
                  setIsCreateClassModalOpen(false);
                }
              }} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tên lớp học</label>
                  <input 
                    autoFocus
                    type="text" 
                    required
                    value={newClassName}
                    onChange={e => setNewClassName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder="Nhập tên lớp..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Danh sách học sinh (tùy chọn)</label>
                  <p className="text-xs text-slate-500 mb-2">Copy cột tên học sinh từ Excel và dán vào đây (mỗi dòng 1 học sinh).</p>
                  <textarea
                    value={pastedStudents}
                    onChange={e => setPastedStudents(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all min-h-[150px] resize-y"
                    placeholder="Nguyễn Văn A&#10;Trần Thị B&#10;Lê Văn C..."
                  />
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setIsCreateClassModalOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Tạo lớp
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isPrinting && selectedClassId && (
          <PrintablePlickerCards 
            students={allStudents.filter(s => s.classId === selectedClassId)} 
            onClose={() => setIsPrinting(false)} 
          />
        )}
      </div>
    );
  }

  if (view === 'scanner') {
    const studentsWithAnswer = classStudents.filter(s => results.some(r => r.studentId === s.id));
    const hasCorrectAnswer = playingQuestion?.correctAnswer || correctAnswer;
    const correctStudents = classStudents.filter(s => {
      const result = results.find(r => r.studentId === s.id);
      return result && hasCorrectAnswer && (result.answer === playingQuestion?.correctAnswer || result.answer === correctAnswer);
    });
    const incorrectStudents = classStudents.filter(s => {
      const result = results.find(r => r.studentId === s.id);
      return result && hasCorrectAnswer && result.answer !== playingQuestion?.correctAnswer && result.answer !== correctAnswer;
    });
    const answeredStudents = classStudents.filter(s => results.some(r => r.studentId === s.id));

    return (
      <div className="flex-1 flex flex-col h-screen bg-slate-50 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setView('dashboard');
                setIsScanning(false);
              }}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{playingSet ? playingSet.title : 'Tương tác thẻ Plicker'}</h1>
              <p className="text-sm text-slate-500">{currentClass ? currentClass.title : 'Vui lòng chọn lớp học'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <select
                value={selectedClassId}
                onChange={(e) => {
                  const newClassId = e.target.value;
                  setSelectedClassId(newClassId);
                  setResults([]);
                  setIsScanning(false);
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
              >
                <option value="">-- Chọn lớp học --</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              <button
                onClick={() => setIsCreateClassModalOpen(true)}
                className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                title="Tạo lớp học mới"
              >
                <Plus className="w-5 h-5" />
              </button>
              {selectedClassId && (
                <button
                  onClick={() => setIsPrintModalOpen(true)}
                  className="p-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                  title="In thẻ Plicker cho lớp này"
                >
                  <Printer className="w-5 h-5" />
                </button>
              )}
            </div>

            {playingSet && (
              <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1 border border-slate-200">
                <button 
                  onClick={() => setPlayingQuestionIndex(Math.max(0, playingQuestionIndex - 1))}
                  disabled={playingQuestionIndex === 0}
                  className="p-1.5 hover:bg-white rounded-md disabled:opacity-50 text-slate-600"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="px-3 font-bold text-slate-700 text-sm">
                  {playingQuestionIndex + 1} / {playingSet.questions.length}
                </span>
                <button 
                  onClick={() => setPlayingQuestionIndex(Math.min(playingSet.questions.length - 1, playingQuestionIndex + 1))}
                  disabled={playingQuestionIndex === playingSet.questions.length - 1}
                  className="p-1.5 hover:bg-white rounded-md disabled:opacity-50 text-slate-600"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {!playingSet && (
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                {['A', 'B', 'C', 'D'].map((ans) => (
                  <button
                    key={ans}
                    onClick={() => setCorrectAnswer(correctAnswer === ans ? null : ans as any)}
                    disabled={isScanning}
                    className={`w-10 h-10 rounded-md font-bold flex items-center justify-center transition-colors ${
                      correctAnswer === ans 
                        ? 'bg-emerald-500 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-white'
                    }`}
                    title={`Đặt ${ans} làm đáp án đúng`}
                  >
                    {ans}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Question Display or Camera (if no question) */}
          <div className="flex-1 flex flex-col relative bg-white overflow-y-auto">
            {playingQuestion ? (
              <div className="w-full flex flex-col h-full p-8">
                <div className="flex-1 flex flex-col justify-center">
                  <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-12 leading-tight text-center">
                    {playingQuestion.text}
                  </h2>
                  {playingQuestion.image && (
                    <div className="mb-12 flex justify-center">
                      <img src={playingQuestion.image} alt="Question" className="max-h-80 object-contain rounded-xl shadow-md" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-6 mt-auto">
                  {['A', 'B', 'C', 'D'].map((opt) => {
                    const optionText = playingQuestion.options[opt as keyof typeof playingQuestion.options];
                    if (!optionText) return null;
                    const isCorrect = playingQuestion.correctAnswer === opt;
                    const showAsCorrect = showCorrect && isCorrect;
                    const showAsIncorrect = showCorrect && !isCorrect;
                    
                    return (
                      <div key={opt} className={`p-6 rounded-2xl border-2 flex items-center gap-6 text-2xl transition-all ${
                        showAsCorrect ? 'border-emerald-500 bg-emerald-50 shadow-md transform scale-[1.02]' : 
                        showAsIncorrect ? 'border-slate-200 bg-slate-50 opacity-50' : 
                        'border-slate-200 bg-white shadow-sm'
                      }`}>
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-3xl shrink-0 ${
                          showAsCorrect ? 'bg-emerald-500 text-white' : 
                          showAsIncorrect ? 'bg-slate-300 text-white' : 
                          'bg-blue-500 text-white'
                        }`}>
                          {opt}
                        </div>
                        <span className={`font-medium ${showAsCorrect ? 'text-emerald-900' : 'text-slate-700'}`}>{optionText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                <LayoutGrid className="w-20 h-20 mb-6 opacity-30" />
                <p className="text-2xl font-medium text-slate-500">Không có bộ câu hỏi nào đang phát</p>
                <p className="text-slate-400 mt-2">Vui lòng thêm bộ câu hỏi vào hàng đợi của lớp học này.</p>
              </div>
            )}
          </div>

          {/* Right: Camera & Students */}
          <div className="w-[400px] bg-slate-50 border-l border-slate-200 flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.05)] z-10 shrink-0">
            {/* Camera Section */}
            <div className="h-72 bg-black relative shrink-0">
              {!selectedClassId ? (
                <div className="absolute inset-0 flex items-center justify-center text-white/50">
                  <p>Chọn lớp học để quét</p>
                </div>
              ) : (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${!isScanning ? 'opacity-0' : 'opacity-100'}`} />
                  <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                  
                  {!isScanning ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white">
                      <Camera className="w-12 h-12 mb-4 text-indigo-400" />
                      <button onClick={() => setIsScanning(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-full font-bold transition-transform hover:scale-105 shadow-lg">
                        Bắt đầu quét
                      </button>
                    </div>
                  ) : (
                    <>
                      {isProcessing && (
                        <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center">
                           <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
                           <span className="text-white font-bold text-sm bg-black/40 px-3 py-1 rounded-full">Đang phân tích thẻ...</span>
                        </div>
                      )}
                      
                      {/* Scanning Line overlay */}
                      <div className="absolute inset-0 pointer-events-none opacity-20 z-10">
                        <div className="w-full h-1 bg-emerald-500 absolute top-0 animate-[scan_3s_linear_infinite]" />
                      </div>
                      <style>{`
                        @keyframes scan {
                          0% { top: 0; }
                          100% { top: 100%; }
                        }
                      `}</style>

                      {/* Scanning status overlay */}
                      <div className="absolute top-16 left-4 right-4 flex flex-col gap-2 pointer-events-none z-20">
                        {isProcessing ? (
                          <div className="bg-amber-500/90 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-xl flex items-center gap-3 animate-pulse self-center border border-amber-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Đang phân tích thẻ học sinh...</span>
                          </div>
                        ) : (
                          <div className="bg-emerald-500/80 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-xl flex items-center gap-3 self-center border border-emerald-400">
                            <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                            <span>Đang quét tự động...</span>
                          </div>
                        )}
                      </div>

                      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 z-30">
                        <button onClick={() => setIsScanning(false)} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-full font-bold text-sm shadow-xl flex items-center gap-2 transition-all hover:scale-105">
                          <Square className="w-4 h-4 fill-current" /> Dừng quét & Xem kết quả
                        </button>
                      </div>
                    </>
                  )}
                  
                  {/* Scan Progress */}
                  {isScanning && (
                    <>
                      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 border border-white/10">
                        <span className="text-emerald-400">{totalScanned}</span> / {totalStudents}
                      </div>

                      {/* Floating metadata for detected students */}
                      <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {lastDetected.map((detected) => (
                          <div 
                            key={detected.id}
                            className="absolute bg-emerald-500/90 text-white px-3 py-1.5 rounded-lg font-bold text-sm shadow-xl flex items-center gap-2 border border-white/20 animate-in zoom-in fade-in duration-300"
                            style={{ left: `${detected.x}%`, top: `${detected.y}%` }}
                          >
                            <span className="whitespace-nowrap">{detected.name}</span>
                            <span className="bg-white/20 px-1.5 rounded font-mono">{detected.answer}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Controls */}
            <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3 shrink-0">
              <button 
                onClick={() => {
                  if (showDetails) {
                    setShowDetails(false);
                    setShowGraph(true);
                  } else if (showGraph) {
                    setShowGraph(false);
                  } else {
                    setShowGraph(true);
                  }
                }}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${showGraph && !showDetails ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
              >
                <BarChart3 className="w-4 h-4" />
                Biểu đồ
              </button>
              <button 
                onClick={() => {
                  if (showDetails) {
                    setShowDetails(false);
                  } else {
                    setShowDetails(true);
                    setShowGraph(false);
                  }
                }}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${showDetails ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
              >
                <Users className="w-4 h-4" />
                Chi tiết
              </button>
              <button 
                onClick={() => setShowCorrect(!showCorrect)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${showCorrect ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
              >
                <CheckCircle className="w-4 h-4" />
                Đáp án
              </button>
              <button 
                onClick={handleReset}
                disabled={isScanning || results.length === 0}
                className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 border border-slate-200 bg-slate-50"
                title="Làm mới kết quả"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Student List or Graph or Details */}
            <div className="flex-1 overflow-y-auto p-4 bg-white">
              {results.length > 0 && !showGraph && !showDetails && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-800 text-sm">Vừa quét ({results.length})</h3>
                    <button onClick={() => setResults([])} className="text-[10px] text-red-500 hover:underline">Xoá hết</button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {[...results].reverse().slice(0, 10).map((result, idx) => (
                      <div 
                        key={result.studentId + idx} 
                        className="px-4 py-3 rounded-2xl text-sm font-bold flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 animate-in slide-in-from-right-4 duration-300 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs">
                            {results.length - idx}
                          </div>
                          <span className="truncate pr-2">{result.studentName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="bg-white px-2 py-0.5 rounded border border-emerald-200">{result.answer}</span>
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showGraph ? (
                <div className="h-full flex flex-col">
                  {/* ... Existing Graph UI ... */}
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-slate-800">Kết quả thống kê</h3>
                    <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                      {totalScanned} đã trả lời
                    </span>
                  </div>
                  <div className="flex-1 flex items-end gap-3 pb-4">
                    {['A', 'B', 'C', 'D'].map((ans) => {
                      const count = results.filter(r => r.answer === ans).length;
                      const height = totalScanned > 0 ? (count / totalScanned) * 100 : 0;
                      const isCorrect = playingQuestion?.correctAnswer === ans || correctAnswer === ans;
                      
                      return (
                        <div key={ans} className="flex-1 flex flex-col items-center gap-3 h-full justify-end cursor-pointer group" onClick={() => setShowDetails(true)} title="Xem chi tiết học sinh">
                          <div className="w-full relative flex items-end justify-center h-full">
                            <div 
                              className={`w-full rounded-t-xl transition-all duration-500 group-hover:opacity-80 ${
                                showCorrect && isCorrect ? 'bg-emerald-500' : 'bg-indigo-500'
                              }`}
                              style={{ height: `${height > 0 ? Math.max(height, 2) : 0}%` }}
                            />
                            <div className="absolute -top-8 text-sm font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md shadow-sm">
                              {count > 0 ? `${Math.round(height)}%` : '0%'}
                            </div>
                          </div>
                          <div className={`font-bold w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 transition-colors ${
                            showCorrect && isCorrect ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                          }`}>
                            {ans}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : showDetails ? (
                <div className="h-full flex flex-col gap-4">
                  {/* ... Existing Details UI ... */}
                  {hasCorrectAnswer ? (
                    <>
                      <div>
                        <h3 className="font-bold text-emerald-600 mb-2 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" /> Chọn đúng ({correctStudents.length})
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {correctStudents.map(s => (
                            <div key={s.id} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded text-sm">
                              {s.name}
                            </div>
                          ))}
                          {correctStudents.length === 0 && <div className="text-sm text-slate-400">Chưa có học sinh nào</div>}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-bold text-red-600 mb-2 flex items-center gap-2">
                          <X className="w-4 h-4" /> Chọn sai ({incorrectStudents.length})
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {incorrectStudents.map(s => (
                            <div key={s.id} className="bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded text-sm">
                              {s.name}
                            </div>
                          ))}
                          {incorrectStudents.length === 0 && <div className="text-sm text-slate-400">Chưa có học sinh nào</div>}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <h3 className="font-bold text-blue-600 mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> Đã trả lời ({answeredStudents.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {answeredStudents.map(s => {
                          const result = results.find(r => r.studentId === s.id);
                          return (
                            <div key={s.id} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded text-sm flex items-center gap-1">
                              <span>{s.name}</span>
                              <span className="font-bold bg-blue-100 px-1.5 rounded">{result?.answer}</span>
                            </div>
                          );
                        })}
                        {answeredStudents.length === 0 && <div className="text-sm text-slate-400">Chưa có học sinh nào</div>}
                      </div>
                    </div>
                  )}
                </div>
              ) : results.length > 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm text-center p-8">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-500 opacity-40" />
                  </div>
                  <p className="font-medium text-slate-500">Đã nhận diện {results.length} học sinh</p>
                  <p className="text-xs mt-2 text-slate-400">Tiếp tục quét để nhận thêm câu trả lời.</p>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm text-center p-8 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Camera className="w-8 h-8 opacity-20" />
                  </div>
                  <p className="font-medium text-slate-500">Hướng camera về phía thẻ học sinh</p>
                  <p className="text-xs mt-2">Nhấn "Quét thẻ AI" để nhận diện các câu trả lời của học sinh.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {isPrinting && selectedClassId && (
          <PrintablePlickerCards 
            students={allStudents.filter(s => s.classId === selectedClassId)} 
            onClose={() => setIsPrinting(false)} 
          />
        )}
      </div>
    );
  }

  if (view === 'editor') {
    return (
      <div className="flex flex-col h-screen bg-[#F5F6F7] font-sans">
        {/* Top Navigation */}
        <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setView('dashboard')} className="p-2 text-slate-500 hover:bg-slate-100 rounded">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center border border-slate-200 rounded overflow-hidden">
              <button className="p-2 bg-white hover:bg-slate-50 text-blue-500 border-r border-slate-200">
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button className="p-2 bg-white hover:bg-slate-50 text-blue-500">
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center ml-2">
              <button 
                onClick={handleUndo}
                disabled={history.past.length === 0}
                className={`p-2 ${history.past.length === 0 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Undo className="w-5 h-5" />
              </button>
              <button 
                onClick={handleRedo}
                disabled={history.future.length === 0}
                className={`p-2 ${history.future.length === 0 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Redo className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex justify-center">
            <input 
              type="text" 
              value={currentSetTitle}
              onChange={(e) => setCurrentSetTitle(e.target.value)}
              className="text-center font-bold text-slate-800 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 w-64"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="relative" ref={queueDropdownRef}>
              <button 
                onClick={() => setIsQueueDropdownOpen(!isQueueDropdownOpen)}
                className="px-4 py-1.5 border border-slate-300 rounded text-sm text-slate-600 font-medium hover:bg-slate-50"
              >
                Thêm vào hàng đợi
              </button>
              
              {isQueueDropdownOpen && (
                <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-md shadow-lg border border-slate-200 z-50 py-2">
                  <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Thêm vào
                  </div>
                  {categories.map((c, i) => {
                    const colors = ['bg-emerald-500', 'bg-purple-500', 'bg-blue-500', 'bg-orange-500', 'bg-pink-500'];
                    const colorClass = colors[i % colors.length];
                    const isQueued = currentSetId ? (queuedSets[c.id] || []).includes(currentSetId) : false;
                    
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          if (!currentSetId) return;
                          setQueuedSets(prev => {
                            const classQueue = prev[c.id] || [];
                            if (classQueue.includes(currentSetId)) {
                              return { ...prev, [c.id]: classQueue.filter(id => id !== currentSetId) };
                            }
                            return { ...prev, [c.id]: [...classQueue, currentSetId] };
                          });
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                      >
                        <div className={`w-2 h-2 rounded-full ${colorClass}`} />
                        <span className="flex-1 truncate">{c.title}</span>
                        {isQueued && <Check className="w-4 h-4 text-blue-500" />}
                      </button>
                    );
                  })}
                  {categories.length === 0 && (
                    <div className="px-3 py-2 text-sm text-slate-500 italic">
                      Chưa có lớp học nào
                    </div>
                  )}
                </div>
              )}
            </div>
            <button 
              onClick={() => setIsImportModalOpen(true)}
              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded border border-transparent hover:border-slate-200"
            >
              <Download className="w-5 h-5" />
            </button>
            <button className="p-1.5 text-slate-500 hover:bg-slate-100 rounded border border-transparent hover:border-slate-200">
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Formatting Toolbar */}
        <div className="h-10 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 text-sm text-slate-600">
          <div className="flex items-center gap-1">
            <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded font-serif font-bold">B</button>
            <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded font-serif italic">I</button>
            <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded font-serif underline">U</button>
            <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded font-serif">H</button>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider">
              <button 
                className={`pb-1 ${questions.find(q => q.id === activeQuestionId)?.gradingType === 'graded' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-600'}`}
                onClick={() => setQuestions(questions.map(q => q.id === activeQuestionId ? { ...q, gradingType: 'graded' } : q))}
              >
                Đã chấm điểm
              </button>
              <button 
                className={`pb-1 ${questions.find(q => q.id === activeQuestionId)?.gradingType === 'survey' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-600'}`}
                onClick={() => setQuestions(questions.map(q => q.id === activeQuestionId ? { ...q, gradingType: 'survey', correctAnswer: null } : q))}
              >
                Sự khảo sát
              </button>
            </div>
            
            <div className="flex items-center gap-1 border-l border-slate-200 pl-4 relative">
              <button 
                className={`p-1.5 rounded ${activeFormat === 'superscript' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                onClick={() => {
                  setActiveFormat(activeFormat === 'superscript' ? null : 'superscript');
                }}
                title="Chỉ số trên"
              >
                <SuperscriptIcon className="w-4 h-4" />
              </button>
              <button 
                className={`p-1.5 rounded ${activeFormat === 'subscript' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                onClick={() => {
                  setActiveFormat(activeFormat === 'subscript' ? null : 'subscript');
                }}
                title="Chỉ số dưới"
              >
                <SubscriptIcon className="w-4 h-4" />
              </button>
              <button 
                className={`p-1.5 rounded ${activeFormat === 'fraction' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                onClick={() => {
                  setActiveFormat(activeFormat === 'fraction' ? null : 'fraction');
                  insertIntoActiveField(' \n—\n ');
                }}
                title="Phân số"
              >
                <FractionIcon className="w-4 h-4" />
              </button>
              <button 
                className={`p-1.5 rounded ${isMathSymbolsOpen ? 'bg-blue-50 text-blue-500' : 'text-slate-400 hover:bg-slate-100'}`}
                onClick={() => setIsMathSymbolsOpen(true)}
              >
                <Sigma className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button className="hover:text-slate-800">Nhân bản</button>
            <button 
              className="hover:text-red-600 text-slate-600"
              onClick={() => {
                if (questions.length > 1) {
                  const newQuestions = questions.filter(q => q.id !== activeQuestionId);
                  setQuestions(newQuestions);
                  setActiveQuestionId(newQuestions[0].id);
                } else {
                  setQuestions([{ id: 1, text: '', type: 'multiple_choice', gradingType: 'graded', options: { A: '', B: '', C: '', D: '' }, correctAnswer: null }]);
                }
              }}
            >
              Xóa bỏ
            </button>
          </div>
        </div>

        {/* Math Symbols Modal */}
        {isMathSymbolsOpen && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl p-6 flex flex-col">
              {/* Header Links */}
              <div className="flex justify-end items-center gap-6 text-sm text-slate-500 mb-4">
                <button 
                  className="font-bold text-slate-700 hover:text-slate-900"
                  onClick={() => setIsMathSymbolsOpen(false)}
                >
                  Cancel
                </button>
              </div>

              {/* Input Area */}
              <div className="border border-blue-400 rounded-lg p-6 mb-6 min-h-[160px] flex flex-col">
                <div className="flex-1 flex items-start">
                  <textarea 
                    value={currentEquation}
                    onChange={(e) => setCurrentEquation(e.target.value)}
                    onKeyDown={(e) => handleFormatKeyDown(e, true)}
                    className="w-full h-full resize-none outline-none text-2xl font-serif text-slate-800"
                    placeholder="Try typing math or use the buttons below"
                    autoFocus
                  />
                </div>
              </div>

              {/* Buttons Grid */}
              <div className="space-y-3">
                {/* Row 1 */}
                  <div className="flex gap-2">
                    <button onClick={() => insertMathSymbol('—')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">—</button>
                    <button onClick={() => insertMathSymbol('( )')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">( )</button>
                    <button onClick={() => insertMathSymbol('²')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">□²</button>
                    <button onClick={() => insertMathSymbol('³')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">□³</button>
                    <button onClick={() => insertMathSymbol('^')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">□^□</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('=')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">=</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('π')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">π</button>
                    <button onClick={() => insertMathSymbol('∞')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">∞</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('T')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">T</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('∑')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">∑</button>
                    <button onClick={() => insertMathSymbol('∫')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-lg">∫</button>
                    <button onClick={() => insertMathSymbol('dx/dy')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">dx/dy</button>
                    <button onClick={() => insertMathSymbol('f(x)')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">f(x)</button>
                    <button onClick={() => insertMathSymbol('lim')} className="w-10 h-10 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">lim</button>
                  </div>

                  {/* Row 2 */}
                  <div className="flex gap-2">
                    <button onClick={() => insertMathSymbol('+')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">+</button>
                    <button onClick={() => insertMathSymbol('-')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">-</button>
                    <button onClick={() => insertMathSymbol('×')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">×</button>
                    <button onClick={() => insertMathSymbol('÷')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">÷</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('√')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">√</button>
                    <button onClick={() => insertMathSymbol('∛')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">∛</button>
                    <button onClick={() => insertMathSymbol('√')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">□√</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('<')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">&lt;</button>
                    <button onClick={() => insertMathSymbol('>')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">&gt;</button>
                    <button onClick={() => insertMathSymbol('≤')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">≤</button>
                    <button onClick={() => insertMathSymbol('≥')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">≥</button>
                    <button onClick={() => insertMathSymbol('≠')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">≠</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('→')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">→</button>
                    <button onClick={() => insertMathSymbol('←')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">←</button>
                    <button onClick={() => insertMathSymbol('↔')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">↔</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('sin')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-xs">sin</button>
                    <button onClick={() => insertMathSymbol('cos')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-xs">cos</button>
                    <button onClick={() => insertMathSymbol('tan')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-xs">tan</button>
                    <button onClick={() => insertMathSymbol('°')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">°</button>
                  </div>

                  {/* Row 3 */}
                  <div className="flex gap-2">
                    <button onClick={() => insertMathSymbol('·')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">·</button>
                    <button onClick={() => insertMathSymbol('/')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">/</button>
                    <button onClick={() => insertMathSymbol('±')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">±</button>
                    <button onClick={() => insertMathSymbol('~')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">~</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('₁')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">□₁</button>
                    <button onClick={() => insertMathSymbol('₂')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">□₂</button>
                    <button onClick={() => insertMathSymbol('_')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">□_□</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('≪')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">≪</button>
                    <button onClick={() => insertMathSymbol('≫')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">≫</button>
                    <button onClick={() => insertMathSymbol('≮')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">≮</button>
                    <button onClick={() => insertMathSymbol('≯')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">≯</button>
                    <button onClick={() => insertMathSymbol('≈')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">≈</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('¯')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">¯</button>
                    <button onClick={() => insertMathSymbol('⇀')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">⇀</button>
                    <button onClick={() => insertMathSymbol('⇌')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">⇌</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('log')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-xs">log</button>
                    <button onClick={() => insertMathSymbol('log_n')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-xs">logₙ</button>
                    <button onClick={() => insertMathSymbol('ln')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-xs">ln</button>
                    <button onClick={() => insertMathSymbol('∠')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">∠</button>
                  </div>

                  {/* Row 4 */}
                  <div className="flex gap-2 pt-4">
                    <button onClick={() => insertMathSymbol('α')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">α</button>
                    <button onClick={() => insertMathSymbol('β')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">β</button>
                    <button onClick={() => insertMathSymbol('γ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">γ</button>
                    <button onClick={() => insertMathSymbol('δ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">δ</button>
                    <button onClick={() => insertMathSymbol('ε')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">ε</button>
                    <button onClick={() => insertMathSymbol('η')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">η</button>
                    <button onClick={() => insertMathSymbol('θ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">θ</button>
                    <button onClick={() => insertMathSymbol('ι')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">ι</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('⊂')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">⊂</button>
                    <button onClick={() => insertMathSymbol('⊃')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">⊃</button>
                    <button onClick={() => insertMathSymbol('∩')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">∩</button>
                    <button onClick={() => insertMathSymbol('∪')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">∪</button>
                  </div>

                  {/* Row 5 */}
                  <div className="flex gap-2">
                    <button onClick={() => insertMathSymbol('κ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">κ</button>
                    <button onClick={() => insertMathSymbol('λ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">λ</button>
                    <button onClick={() => insertMathSymbol('μ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">μ</button>
                    <button onClick={() => insertMathSymbol('ξ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">ξ</button>
                    <button onClick={() => insertMathSymbol('π')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">π</button>
                    <button onClick={() => insertMathSymbol('ρ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">ρ</button>
                    <button onClick={() => insertMathSymbol('σ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">σ</button>
                    <button onClick={() => insertMathSymbol('ω')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">ω</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('∅')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">∅</button>
                    <button onClick={() => insertMathSymbol('∈')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">∈</button>
                    <button onClick={() => insertMathSymbol('∴')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">∴</button>
                    <button onClick={() => insertMathSymbol('∀')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">∀</button>
                  </div>

                  {/* Row 6 */}
                  <div className="flex gap-2">
                    <button onClick={() => insertMathSymbol('Γ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">Γ</button>
                    <button onClick={() => insertMathSymbol('Δ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">Δ</button>
                    <button onClick={() => insertMathSymbol('Θ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">Θ</button>
                    <button onClick={() => insertMathSymbol('Λ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">Λ</button>
                    <button onClick={() => insertMathSymbol('Π')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">Π</button>
                    <button onClick={() => insertMathSymbol('Ψ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">Ψ</button>
                    <button onClick={() => insertMathSymbol('Σ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">Σ</button>
                    <button onClick={() => insertMathSymbol('Ω')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">Ω</button>
                    <div className="w-4"></div>
                    <button onClick={() => insertMathSymbol('ℕ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">ℕ</button>
                    <button onClick={() => insertMathSymbol('ℝ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">ℝ</button>
                    <button onClick={() => insertMathSymbol('ℤ')} className="w-8 h-8 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center font-serif text-sm">ℤ</button>
                  </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex justify-end mt-8">
                <button 
                  className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg shadow-sm transition-colors text-lg"
                  onClick={handleInsertEquation}
                >
                  Insert Equation
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar (Thumbnails) */}
          <div className="w-48 bg-white border-r border-slate-200 flex flex-col pt-4 overflow-y-auto shrink-0">
            {questions.map((q, index) => (
              <div 
                key={q.id} 
                className="relative pl-8 pr-4 mb-4 cursor-pointer"
                onClick={() => setActiveQuestionId(q.id)}
              >
                {activeQuestionId === q.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                )}
                <div className={`border-2 rounded bg-white aspect-[4/3] p-2 flex flex-col relative ${activeQuestionId === q.id ? 'border-blue-500' : 'border-slate-200 hover:border-slate-300'}`}>
                  {q.gradingType === 'survey' && (
                    <div className="absolute top-1 right-1 text-purple-400" title="Khảo sát">
                      <PieChart className="w-3 h-3" />
                    </div>
                  )}
                  {q.image && (
                    <div className="w-full h-12 mb-1 flex items-center justify-center bg-slate-50 rounded overflow-hidden">
                      <img src={q.image} alt="Preview" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                  <div className="text-[8px] text-slate-400 mb-1 line-clamp-2">{q.text || 'Nhấp vào đây để chỉnh sửa câu hỏi'}</div>
                  <div className="mt-auto space-y-0.5">
                    {['A', 'B', 'C', 'D'].map(opt => (
                      <div key={opt} className="text-[6px] text-slate-400 flex items-center gap-1">
                        <span className="font-bold">{opt}</span>
                        <span className="truncate">{q.options[opt as keyof typeof q.options]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${activeQuestionId === q.id ? 'text-white bg-blue-500' : 'text-slate-500 bg-slate-200'}`}>
                  {index + 1}
                </div>
              </div>
            ))}
            <button 
              onClick={() => {
                const newId = Math.max(...questions.map(q => q.id)) + 1;
                setQuestions([...questions, { id: newId, text: '', type: 'multiple_choice', gradingType: 'graded', options: { A: '', B: '', C: '', D: '' }, correctAnswer: null }]);
                setActiveQuestionId(newId);
              }}
              className="mx-4 mb-4 py-2 border-2 border-dashed border-slate-300 rounded text-slate-500 hover:border-blue-500 hover:text-blue-500 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Thêm câu hỏi
            </button>
          </div>

          {/* Main Editor Area */}
          <div className="flex-1 overflow-y-auto p-8 relative flex justify-center bg-slate-50">
            <div className={`w-full max-w-4xl bg-white shadow-sm border ${questions.find(q => q.id === activeQuestionId)?.gradingType === 'survey' ? 'border-purple-300' : 'border-slate-200'} rounded-lg flex flex-col min-h-[600px] overflow-hidden`}>
              {questions.find(q => q.id === activeQuestionId)?.gradingType === 'survey' && (
                <div className="bg-purple-50 text-purple-700 text-xs font-bold uppercase tracking-wider py-2 px-8 border-b border-purple-100 flex items-center justify-between">
                  <span>Chế độ khảo sát</span>
                  <span className="font-normal normal-case opacity-80">Câu trả lời sẽ không được chấm điểm</span>
                </div>
              )}
              {/* Question Input */}
              <div className="p-8 border-b border-slate-100 flex-1 flex flex-col">
                {questions.find(q => q.id === activeQuestionId)?.image && (
                  <div className="relative mb-6 self-center group">
                    <img 
                      src={questions.find(q => q.id === activeQuestionId)?.image} 
                      alt="Question Image" 
                      className="max-h-64 object-contain rounded-lg border border-slate-200"
                    />
                    <button 
                      onClick={() => setQuestions(questions.map(q => q.id === activeQuestionId ? { ...q, image: undefined } : q))}
                      className="absolute -top-2 -right-2 bg-white text-slate-400 hover:text-red-500 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Xóa ảnh"
                    >
                      <XCircle className="w-6 h-6" />
                    </button>
                  </div>
                )}
                {questions.find(q => q.id === activeQuestionId)?.video && (
                  <div className="relative mb-6 self-center group w-full max-w-2xl aspect-video rounded-lg overflow-hidden border border-slate-200 bg-black">
                    <iframe 
                      src={questions.find(q => q.id === activeQuestionId)?.video} 
                      title="YouTube video player" 
                      frameBorder="0" 
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                      allowFullScreen
                      className="w-full h-full"
                    ></iframe>
                    <button 
                      onClick={() => setQuestions(questions.map(q => q.id === activeQuestionId ? { ...q, video: undefined } : q))}
                      className="absolute -top-2 -right-2 bg-white text-slate-400 hover:text-red-500 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Xóa video"
                    >
                      <XCircle className="w-6 h-6" />
                    </button>
                  </div>
                )}
                <textarea 
                  value={questions.find(q => q.id === activeQuestionId)?.text || ''}
                  onFocus={() => setFocusedField('text')}
                  onChange={(e) => {
                    setQuestions(questions.map(q => 
                      q.id === activeQuestionId ? { ...q, text: e.target.value } : q
                    ));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      const newId = Math.max(...questions.map(q => q.id)) + 1;
                      setQuestions([...questions, { id: newId, text: '', type: 'multiple_choice', gradingType: 'graded', options: { A: '', B: '', C: '', D: '' }, correctAnswer: null }]);
                      setActiveQuestionId(newId);
                    } else {
                      handleFormatKeyDown(e);
                    }
                  }}
                  className="w-full flex-1 text-3xl text-slate-700 resize-none outline-none placeholder:text-slate-300"
                  placeholder="Nhấp vào đây để chỉnh sửa câu hỏi"
                />
              </div>

              {/* Options */}
              <div className="p-8 space-y-4 bg-white rounded-b-lg">
                {(['A', 'B', 'C', 'D'] as const)
                  .filter(opt => questions.find(q => q.id === activeQuestionId)?.options[opt] !== undefined)
                  .map((opt) => (
                  <div key={opt} className="flex items-center gap-4 group">
                    <button 
                      onClick={() => {
                        if (questions.find(q => q.id === activeQuestionId)?.gradingType === 'survey') return;
                        setQuestions(questions.map(q => 
                          q.id === activeQuestionId 
                            ? { ...q, correctAnswer: q.correctAnswer === opt ? null : opt as 'A' | 'B' | 'C' | 'D' } 
                            : q
                        ));
                      }}
                      className={`w-10 h-10 shrink-0 border-2 rounded flex items-center justify-center text-xl font-bold transition-colors ${
                        questions.find(q => q.id === activeQuestionId)?.gradingType === 'survey'
                          ? 'border-slate-200 text-slate-400 cursor-default bg-slate-50'
                          : questions.find(q => q.id === activeQuestionId)?.correctAnswer === opt
                            ? 'border-emerald-400 bg-emerald-400 text-white hover:bg-emerald-500 hover:border-emerald-500'
                            : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      disabled={questions.find(q => q.id === activeQuestionId)?.gradingType === 'survey'}
                    >
                      {opt}
                    </button>
                    <input 
                      type="text" 
                      value={questions.find(q => q.id === activeQuestionId)?.options[opt] || ''}
                      onFocus={() => setFocusedField(opt as 'A' | 'B' | 'C' | 'D')}
                      onChange={(e) => {
                        setQuestions(questions.map(q => 
                          q.id === activeQuestionId ? { 
                            ...q, 
                            options: { ...q.options, [opt]: e.target.value } 
                          } : q
                        ));
                      }}
                      onKeyDown={handleFormatKeyDown}
                      placeholder="Nhấp vào đây để chỉnh sửa"
                      className="flex-1 text-2xl text-slate-700 outline-none placeholder:text-slate-300 border border-slate-200 rounded-md px-4 py-2 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
                    />
                    <button 
                      onClick={() => handleDeleteOption(opt)}
                      className="w-12 h-12 shrink-0 border border-slate-200 rounded-md flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors"
                      title="Xóa lựa chọn"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Floating Right Toolbar */}
          <div className={`fixed right-8 top-1/2 -translate-y-1/2 flex items-start gap-2 transition-transform duration-300 z-40 ${isRightToolbarOpen ? 'translate-x-0' : 'translate-x-[120%]'}`}>
            <div className="bg-slate-200/80 backdrop-blur-sm shadow-sm border border-slate-300 rounded-xl p-2 flex flex-col gap-4 items-center py-4">
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsImageModalOpen(true);
                }}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-300 rounded-lg cursor-pointer transition-colors" 
                title="Chèn hình ảnh"
              >
                <Image className="w-5 h-5" />
              </button>
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsVideoModalOpen(true);
                }}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-300 rounded-lg cursor-pointer transition-colors" 
                title="Chèn video"
              >
                <Video className="w-5 h-5" />
              </button>
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsAudioModalOpen(true);
                }}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-300 rounded-lg cursor-pointer transition-colors" 
                title="Chèn âm thanh"
              >
                <Volume2 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setView('dashboard')}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-300 rounded-lg transition-colors" 
                title="Trang chủ"
              >
                <Home className="w-5 h-5" />
              </button>
              <button className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-300 rounded-lg transition-colors font-bold text-xs" title="Chèn GIF">GIF</button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="h-12 bg-white border-t border-slate-200 flex items-center justify-between px-4 shrink-0">
          {/* Left Actions */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleShuffleOptions}
              className="flex items-center gap-2 px-3 py-1.5 text-xs border border-slate-300 rounded text-slate-600 hover:bg-slate-50 font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Xáo trộn
            </button>
            {Object.keys(questions.find(q => q.id === activeQuestionId)?.options || {}).length < 4 && (
              <button 
                onClick={handleAddOption}
                className="flex items-center gap-2 px-3 py-1.5 text-xs border border-slate-300 rounded text-slate-600 hover:bg-slate-50 font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm lựa chọn
              </button>
            )}
          </div>

          {/* Center Actions */}
          <div className="flex items-center gap-4">
            <button 
              className={`px-3 py-1.5 text-xs border rounded font-medium transition-colors ${
                questions.find(q => q.id === activeQuestionId)?.options.A === 'True' && questions.find(q => q.id === activeQuestionId)?.options.B === 'False' && Object.keys(questions.find(q => q.id === activeQuestionId)?.options || {}).length === 2
                  ? 'bg-blue-50 border-blue-200 text-blue-600'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => {
                setQuestions(questions.map(q => {
                  if (q.id === activeQuestionId) {
                    const isAlreadyTrueFalse = q.options.A === 'True' && q.options.B === 'False' && Object.keys(q.options).length === 2;
                    if (isAlreadyTrueFalse) {
                      // If it's already True/False, maybe add C and D back? Or just do nothing.
                      // Let's just reset to empty A, B, C, D
                      return { ...q, options: { A: '', B: '', C: '', D: '' }, correctAnswer: null };
                    } else {
                      // Set to True/False
                      return { ...q, options: { A: 'True', B: 'False' }, correctAnswer: null };
                    }
                  }
                  return q;
                }));
              }}
            >
              Chọn Đúng/Sai
            </button>
            <div className="flex items-center border border-slate-200 rounded overflow-hidden">
              <button className="p-1.5 bg-blue-500 text-white"><AlignLeft className="w-4 h-4" /></button>
              <button className="p-1.5 bg-white text-slate-400 hover:bg-slate-50"><AlignCenter className="w-4 h-4" /></button>
              <button className="p-1.5 bg-white text-slate-400 hover:bg-slate-50"><AlignRight className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400">Vừa mới lưu xong</span>
            <button className="px-3 py-1.5 text-xs border border-slate-300 rounded text-slate-800 font-bold hover:bg-slate-50">
              What's Possible
            </button>
          </div>
        </div>

        {/* Image Modal */}
        {isImageModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-[800px] flex flex-row overflow-hidden" style={{ height: '600px' }}>
              {/* Main Content Area */}
              <div className="flex-1 flex flex-col relative">
                {/* Top Search Bar */}
                <div className="p-6">
                  <div className="flex items-center border border-blue-400 rounded-md overflow-hidden">
                    <div className="pl-3 pr-2 text-slate-400">
                      <Search className="w-5 h-5" />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Tìm kiếm hình ảnh trên Internet hoặc dán hình ảnh" 
                      className="flex-1 py-2 outline-none text-slate-700 font-medium"
                      value={imageSearchQuery}
                      onChange={(e) => setImageSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setSubmittedImageQuery(imageSearchQuery);
                        }
                      }}
                    />
                    <button 
                      onClick={() => {
                        setIsImageModalOpen(false);
                        setImageSearchQuery('');
                        setSubmittedImageQuery('');
                      }}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-50 border-l border-slate-200 text-sm"
                    >
                      Hủy bỏ
                    </button>
                  </div>
                </div>

                {/* Content Area */}
                {submittedImageQuery.trim() !== '' ? (
                  <div className="flex-1 overflow-y-auto p-6 pt-0">
                    <div className="grid grid-cols-3 gap-4">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => {
                        const imageUrl = `https://picsum.photos/seed/${encodeURIComponent(submittedImageQuery)}-${index}/400/300`;
                        return (
                          <div 
                            key={index}
                            className="aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group relative"
                            onClick={() => handleImageSelect(imageUrl)}
                          >
                            <img 
                              src={imageUrl} 
                              alt={`Search result ${index}`} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="bg-white text-blue-600 px-3 py-1.5 rounded-full text-sm font-bold shadow-sm">
                                Chọn
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-auto p-8 flex flex-col items-center justify-center bg-slate-50/50 mx-6 mb-6 rounded-xl">
                    <label className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-4 flex flex-col items-center justify-center shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer">
                      <span className="font-bold text-slate-800 text-sm">Tải ảnh từ máy tính lên...</span>
                      <span className="text-xs text-slate-500 mt-1">PNG, JPEG, GIF, BMP</span>
                      <input 
                        type="file" 
                        accept="image/png, image/jpeg, image/gif, image/bmp" 
                        className="hidden" 
                        onChange={handleImageUpload} 
                      />
                    </label>
                    <p className="text-xs text-slate-500 mt-4">
                      Tìm hiểu cách sao chép và dán hình ảnh vào Flickr.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Video Modal */}
        {isVideoModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-[800px] flex flex-row overflow-hidden" style={{ height: '600px' }}>
              {/* Main Content Area */}
              <div className="flex-1 flex flex-col relative">
                {/* Top Search Bar */}
                <div className="p-6">
                  <div className="flex items-center border border-slate-300 rounded-md overflow-hidden focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
                    <div className="pl-3 pr-2 text-slate-400">
                      <Search className="w-5 h-5" />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Tìm kiếm trên YouTube hoặc dán liên kết YouTube." 
                      className="flex-1 py-2 outline-none text-slate-700 font-medium"
                      value={videoSearchQuery}
                      onChange={(e) => setVideoSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setSubmittedVideoQuery(videoSearchQuery);
                        }
                      }}
                    />
                    <button 
                      onClick={() => {
                        setIsVideoModalOpen(false);
                        setVideoSearchQuery('');
                        setSubmittedVideoQuery('');
                      }}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-50 border-l border-slate-200 text-sm"
                    >
                      Hủy bỏ
                    </button>
                  </div>
                </div>

                {/* Content Area */}
                {submittedVideoQuery.trim() !== '' ? (
                  <div className="flex-1 overflow-y-auto p-6 pt-0">
                    <div className="flex flex-col gap-6">
                      {(() => {
                        const extractYoutubeId = (url: string) => {
                          const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                          const match = url.match(regExp);
                          return (match && match[2].length === 11) ? match[2] : null;
                        };
                        
                        const extractedId = extractYoutubeId(submittedVideoQuery);
                        
                        if (extractedId) {
                          const videoUrl = `https://www.youtube.com/embed/${extractedId}`;
                          const thumbnailUrl = `https://img.youtube.com/vi/${extractedId}/hqdefault.jpg`;
                          return (
                            <div 
                              className="flex flex-row gap-4 cursor-pointer group"
                              onClick={() => handleVideoSelect(videoUrl)}
                            >
                              <div className="w-48 aspect-video relative rounded-md overflow-hidden bg-slate-100 flex-shrink-0">
                                <img 
                                  src={thumbnailUrl} 
                                  alt="Video thumbnail" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                  <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Play className="w-5 h-5 fill-current ml-1" />
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col py-1">
                                <h4 className="font-bold text-slate-800 text-sm leading-snug group-hover:text-blue-600 transition-colors">
                                  Video từ liên kết YouTube
                                </h4>
                                <p className="text-xs text-blue-500 mt-1">{videoUrl}</p>
                              </div>
                            </div>
                          );
                        }

                        return [1, 2, 3, 4, 5].map((index) => {
                          const videoIds = ['dQw4w9WgXcQ', 'jNQXAC9IVRw', 'M7lc1UVf-VE', '2g811Eo7K8U', 'kJQP7kiw5Fk'];
                          const channelNames = ['Nhạc Thiếu Nhi', 'Ca Nhạc Thiếu Nhi Việt Nam', 'VNM', 'Chill cùng bé iu', 'Like VNM'];
                          const videoId = videoIds[index % videoIds.length];
                          const videoUrl = `https://www.youtube.com/embed/${videoId}`;
                          const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                          
                          // Generate a title that includes the search query to make it look realistic
                          const titles = [
                            `Chú ${submittedVideoQuery} - Nhạc Thiếu Nhi - Hai Con ${submittedVideoQuery} đá bóng`,
                            `🐱 Chú ${submittedVideoQuery} dễ thương trong nhà | Thú cưng dễ thương | LiaChaCha - Ca Nhạc Thiếu Nhi Việt Nam`,
                            `Diana and Roma Những tập phim hay nhất về chú ${submittedVideoQuery} con | Diana và Roma tieng viet`,
                            `🐱 Khám bệnh cho ${submittedVideoQuery} con 👨‍⚕️ | LiaChaCha - Ca Nhạc Thiếu Nhi Việt Nam`,
                            `${submittedVideoQuery} mẹ đâu rồi | Chun Chin | Nhạc thiếu nhi vui nhộn`
                          ];
                          
                          return (
                            <div 
                              key={index}
                              className="flex flex-row gap-4 cursor-pointer group"
                              onClick={() => handleVideoSelect(videoUrl)}
                            >
                              <div className="w-48 aspect-video relative rounded-md overflow-hidden bg-slate-100 flex-shrink-0">
                                <img 
                                  src={thumbnailUrl} 
                                  alt={`Video thumbnail ${index}`} 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                  <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Play className="w-5 h-5 fill-current ml-1" />
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col py-1">
                                <h4 className="font-bold text-slate-800 text-sm leading-snug group-hover:text-blue-600 transition-colors">
                                  {titles[index % titles.length]}
                                </h4>
                                <p className="text-xs text-blue-500 mt-1">{channelNames[index % channelNames.length]}</p>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center pb-20">
                    <div className="flex flex-col items-center gap-2 opacity-50">
                      <div className="flex items-center gap-1">
                        <div className="w-8 h-6 bg-red-600 rounded-lg flex items-center justify-center">
                          <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[6px] border-l-white border-b-[4px] border-b-transparent ml-0.5"></div>
                        </div>
                        <span className="text-2xl font-bold tracking-tighter text-slate-800">YouTube</span>
                      </div>
                      <span className="text-sm text-slate-500">Điều khoản dịch vụ của YouTube</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Audio Modal */}
        {isAudioModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-[800px] flex flex-col overflow-hidden p-8" style={{ height: '600px' }}>
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                {audioModalView === 'library' ? (
                  <button 
                    onClick={() => setAudioModalView('record')}
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-medium transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Record
                  </button>
                ) : (
                  <div></div>
                )}
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => {
                      setIsAudioModalOpen(false);
                      setAudioModalView('record');
                    }}
                    className="text-slate-500 hover:text-slate-800 text-sm font-bold transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {audioModalView === 'record' ? (
                <>
                  {/* Main Recording Area */}
                  <div className="flex-1 bg-[#f8fbff] rounded-2xl flex flex-col items-center justify-center mb-6">
                    <button className="w-48 h-48 bg-[#e6f0fd] rounded-full flex items-center justify-center mb-8 hover:bg-[#d5e6fc] transition-colors cursor-pointer group">
                      <Mic className="w-20 h-20 text-[#3b82f6] group-hover:scale-110 transition-transform" />
                    </button>
                    <div className="text-slate-600 font-medium flex items-center gap-2 text-lg">
                      Click or hold <span className="bg-[#3b82f6] text-white px-3 py-1 rounded font-bold text-sm">Spacebar</span> to record audio
                    </div>
                  </div>

                  {/* Bottom Buttons */}
                  <div className="flex items-center justify-center gap-6">
                    <label className="flex-1 py-4 border border-slate-200 rounded-lg font-bold text-slate-800 hover:bg-slate-50 transition-colors flex items-center justify-center text-lg cursor-pointer">
                      Upload Audio File...
                      <input type="file" accept="audio/*" className="hidden" onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          alert(`Đã chọn âm thanh: ${e.target.files[0].name}`);
                          setIsAudioModalOpen(false);
                        }
                      }} />
                    </label>
                    <button 
                      className="flex-1 py-4 border border-slate-200 rounded-lg font-bold text-slate-800 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-lg"
                      onClick={() => setAudioModalView('library')}
                    >
                      <Music className="w-6 h-6 text-[#3b82f6]" />
                      Sound Library
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <div className="mb-4 relative">
                    <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Search sounds..." 
                      className="w-full pl-10 pr-4 py-3 bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={soundSearchQuery}
                      onChange={(e) => setSoundSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2">
                    <div className="grid grid-cols-1 gap-3">
                      {[
                        { name: 'Correct Answer Ding', duration: '0:02', category: 'Game' },
                        { name: 'Wrong Answer Buzzer', duration: '0:03', category: 'Game' },
                        { name: 'Applause / Cheering', duration: '0:08', category: 'Crowd' },
                        { name: 'Tick Tock Timer', duration: '0:10', category: 'Timer' },
                        { name: 'Drum Roll', duration: '0:05', category: 'Effect' },
                        { name: 'Magic Chime', duration: '0:04', category: 'Effect' },
                        { name: 'Whistle Blow', duration: '0:02', category: 'Sports' },
                        { name: 'Cash Register', duration: '0:01', category: 'Effect' },
                        { name: 'Sad Trombone', duration: '0:04', category: 'Game' },
                        { name: 'Tada Fanfare', duration: '0:03', category: 'Game' },
                      ].filter(sound => sound.name.toLowerCase().includes(soundSearchQuery.toLowerCase())).map((sound, index) => (
                        <div key={index} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 transition-colors group">
                          <div className="flex items-center gap-4">
                            <button className="w-10 h-10 bg-slate-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center text-slate-600 group-hover:text-blue-600 transition-colors">
                              <Play className="w-4 h-4 ml-0.5 fill-current" />
                            </button>
                            <div>
                              <h4 className="font-bold text-slate-800">{sound.name}</h4>
                              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                <span className="bg-slate-100 px-2 py-0.5 rounded">{sound.category}</span>
                                <span>{sound.duration}</span>
                              </div>
                            </div>
                          </div>
                          <button 
                            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors opacity-0 group-hover:opacity-100"
                            onClick={() => {
                              alert(`Đã chọn âm thanh: ${sound.name}`);
                              setIsAudioModalOpen(false);
                              setAudioModalView('record');
                            }}
                          >
                            Select
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Import Modal */}
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 bg-[#F8F9FA] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">Câu hỏi nhập khẩu</h2>
              <div className="flex items-center gap-3">
                <button className="px-4 py-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-50">
                  Gửi phản hồi...
                </button>
                <button className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-slate-400 border border-slate-200 rounded cursor-not-allowed">
                  <Undo className="w-4 h-4" /> Hoàn tác
                </button>
                <div className="flex items-center border border-slate-300 rounded overflow-hidden">
                  <button 
                    onClick={() => setImportOptionCount(2)}
                    className={`px-3 py-1.5 text-sm font-medium border-r border-slate-300 ${importOptionCount === 2 ? 'text-white bg-blue-500' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    2 lựa chọn
                  </button>
                  <button 
                    onClick={() => setImportOptionCount(3)}
                    className={`px-3 py-1.5 text-sm font-medium border-r border-slate-300 ${importOptionCount === 3 ? 'text-white bg-blue-500' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    3 lựa chọn
                  </button>
                  <button 
                    onClick={() => setImportOptionCount(4)}
                    className={`px-3 py-1.5 text-sm font-medium ${importOptionCount === 4 ? 'text-white bg-blue-500' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    4 lựa chọn
                  </button>
                </div>
                <button 
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button 
                  onClick={handleImportQuestions}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600"
                >
                  Nhập khẩu
                </button>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left Editor Area */}
              <div className="flex-1 flex bg-white m-4 shadow-sm border border-slate-200 rounded-lg overflow-hidden relative">
                {/* Line Numbers / Structure Indicator */}
                <div 
                  className="w-16 bg-slate-50 border-r border-slate-200 flex flex-col items-center py-4 select-none overflow-hidden"
                  ref={importIndicatorRef}
                >
                  {renderImportIndicators()}
                </div>
                {/* Textarea */}
                <textarea 
                  className="flex-1 p-4 resize-none focus:outline-none text-slate-700 font-sans whitespace-pre overflow-y-auto"
                  style={{ lineHeight: '24px' }}
                  placeholder="Để bắt đầu, hãy sao chép và dán hàng loạt vào đây!"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  onScroll={(e) => {
                    if (importIndicatorRef.current) {
                      importIndicatorRef.current.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                />
              </div>

              {/* Right Sidebar */}
              <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto">
                <div className="p-6 space-y-8">
                  {/* Tìm và xóa văn bản */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-3">Tìm và xóa văn bản</h3>
                    <div className="flex gap-2 mb-3">
                      <input 
                        type="text" 
                        placeholder="Tìm và xóa" 
                        className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                        value={importSearchText}
                        onChange={(e) => setImportSearchText(e.target.value)}
                      />
                      <button 
                        onClick={handleFindAndRemove}
                        disabled={!importSearchText}
                        className={`px-3 py-1.5 text-sm font-medium rounded border ${!importSearchText ? 'text-slate-400 border-slate-200 cursor-not-allowed' : 'text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                      >
                        Tìm và xóa
                      </button>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={importRemoveMatchingLines}
                          onChange={(e) => setImportRemoveMatchingLines(e.target.checked)}
                          className="rounded border-slate-300 text-blue-500 focus:ring-blue-500" 
                        />
                        Xóa các dòng chứa từ khớp
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={importMatchCase}
                          onChange={(e) => setImportMatchCase(e.target.checked)}
                          className="rounded border-slate-300 text-blue-500 focus:ring-blue-500" 
                        />
                        Hộp diêm
                      </label>
                    </div>
                  </div>

                  <div className="h-px bg-slate-200" />

                  {/* Văn bản được dán sạch */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-2">Văn bản được dán sạch</h3>
                    <p className="text-xs text-slate-500 mb-4">Xóa bỏ những phần văn bản đã dán mà bạn không cần.</p>
                    
                    <div className="flex gap-2 mb-4">
                      <button 
                        onClick={removeQuestionNumbers}
                        className="flex-1 px-2 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-50"
                      >
                        Số câu hỏi
                      </button>
                      <button 
                        onClick={removeOptionLetters}
                        className="flex-1 px-2 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-50"
                      >
                        Thư lựa chọn
                      </button>
                      <button 
                        onClick={removeBullets}
                        className="flex-1 px-2 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-50"
                      >
                        Gạch đầu dòng
                      </button>
                    </div>
                    
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={importAutoClean}
                        onChange={(e) => setImportAutoClean(e.target.checked)}
                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500" 
                      />
                      Tự động làm sạch câu hỏi khi nhập dữ liệu
                    </label>
                  </div>

                  <div className="h-px bg-slate-200" />

                  {/* Xem trước khi nhập */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-3">Xem trước khi nhập</h3>
                    {/* Preview could go here */}
                  </div>

                  <div className="h-px bg-slate-200" />

                  {/* Giúp đỡ */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-2">Giúp đỡ</h3>
                    <a href="#" className="text-sm text-blue-500 hover:underline">Xem hướng dẫn nhập dữ liệu</a>
                  </div>
                </div>
              </div>
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
            <form onSubmit={(e) => {
              e.preventDefault();
              if (newClassName.trim()) {
                const studentList = pastedStudents.split('\n').map(s => s.trim()).filter(s => s);
                onCreateClass(newClassName.trim(), studentList);
                setNewClassName('');
                setPastedStudents('');
                setIsCreateClassModalOpen(false);
              }
            }} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên lớp học</label>
                <input 
                  autoFocus
                  type="text" 
                  required
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Nhập tên lớp..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Danh sách học sinh (tùy chọn)</label>
                <p className="text-xs text-slate-500 mb-2">Copy cột tên học sinh từ Excel và dán vào đây (mỗi dòng 1 học sinh).</p>
                <textarea
                  value={pastedStudents}
                  onChange={e => setPastedStudents(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all min-h-[150px] resize-y"
                  placeholder="Nguyễn Văn A&#10;Trần Thị B&#10;Lê Văn C..."
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setIsCreateClassModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium"
                >
                  Tạo lớp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {isAddStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Thêm học sinh</h3>
              <button 
                onClick={() => setIsAddStudentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const studentList = pastedNewStudents.split('\n').map(s => s.trim()).filter(s => s);
              if (studentList.length > 0 && selectedClassId) {
                onAddStudents(selectedClassId, studentList);
                setPastedNewStudents('');
                setIsAddStudentModalOpen(false);
              }
            }} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Danh sách học sinh</label>
                <p className="text-xs text-slate-500 mb-2">Copy cột tên học sinh từ Excel và dán vào đây (mỗi dòng 1 học sinh).</p>
                <textarea 
                  autoFocus
                  required
                  value={pastedNewStudents}
                  onChange={e => setPastedNewStudents(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all min-h-[150px] resize-y"
                  placeholder="Nguyễn Văn A&#10;Trần Thị B&#10;Lê Văn C..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsAddStudentModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                >
                  Đóng
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium"
                >
                  Thêm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPrinting && selectedClassId && (
        <PrintablePlickerCards 
          students={allStudents.filter(s => s.classId === selectedClassId)} 
          onClose={() => setIsPrinting(false)} 
        />
      )}
    </div>
    );
  }

  return null;
}

const SidebarItem = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={`flex items-center gap-3 px-3 py-2 text-sm rounded cursor-pointer ${
    active 
      ? 'bg-white text-slate-800 shadow-sm border border-slate-200 font-medium' 
      : 'text-slate-700 hover:bg-slate-200'
  }`}>
    <div className={active ? 'text-blue-500' : 'text-slate-500'}>
      {icon}
    </div>
    <span>{label}</span>
  </div>
);

const PrintablePlickerCards = ({ students, onClose }: { students: Student[], onClose: () => void }) => {
  const handlePrint = () => {
    window.focus();
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white overflow-y-auto print:absolute print:inset-0 print:overflow-visible print:z-[200]">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          #print-root, #print-root * {
            visibility: visible;
          }
          #print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
      <div id="print-root">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between no-print shadow-sm z-10 print:hidden">
          <div className="flex flex-col items-center gap-1">
            <h2 className="text-xl font-bold text-slate-800 leading-tight">In thẻ Plicker ({students.length} học sinh)</h2>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Ngày in: {new Date().toLocaleDateString('vi-VN')}</div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
            >
              Đóng
            </button>
            <button 
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2 shadow-lg shadow-indigo-200 active:scale-95"
            >
              <Printer className="w-4 h-4" />
              In thẻ
            </button>
          </div>
        </div>

        <div className="p-8 grid grid-cols-2 gap-8 max-w-5xl mx-auto print:grid print:grid-cols-2 print:gap-1 print:p-8 print:max-w-none">
          {students.map((student, index) => {
            const studentNumber = index + 1;
            const grid = Array(5).fill(0).map(() => Array(5).fill(true));
            const hash = (studentNumber * 137 + 21) % 512;
            
            for (let i = 1; i < 4; i++) {
              for (let j = 1; j < 4; j++) {
                const bit = 1 << ((i - 1) * 3 + (j - 1));
                if ((hash & bit) !== 0) {
                  grid[i][j] = false;
                }
              }
            }
            
            // Ensure asymmetry
            grid[1][1] = false;
            grid[1][3] = true;
            grid[3][1] = true;
            grid[3][3] = false;
            grid[2][2] = false;

            return (
              <div key={student.id} className="flex flex-col items-center justify-center p-8 border-2 border-slate-100 rounded-2xl break-inside-avoid page-break-inside-avoid print:border-slate-100 print:border print:m-1 print:p-8 print:h-[45vh]">
                <div className="text-2xl font-bold mb-8 text-center print:mb-6">
                  <span className="text-slate-300 mr-2 font-mono">#{studentNumber}</span>
                  <span className="text-slate-800">{student.name}</span>
                </div>
                
                <div className="relative w-64 h-64 print:w-56 print:h-56">
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 font-bold text-3xl text-slate-300 print:-top-8 print:text-2xl">B</div>
                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 font-bold text-3xl text-slate-300 rotate-180 print:-bottom-8 print:text-2xl">D</div>
                  <div className="absolute top-1/2 -left-10 -translate-y-1/2 font-bold text-3xl text-slate-300 -rotate-90 print:-left-8 print:text-2xl">A</div>
                  <div className="absolute top-1/2 -right-10 -translate-y-1/2 font-bold text-3xl text-slate-300 rotate-90 print:-right-8 print:text-2xl">C</div>
                  
                  <div className="absolute -top-10 -left-10 font-bold text-xl text-slate-200 print:-top-8 print:-left-8 print:text-lg">{studentNumber}</div>
                  <div className="absolute -top-10 -right-10 font-bold text-xl text-slate-200 print:-top-8 print:-right-8 print:text-lg">{studentNumber}</div>
                  <div className="absolute -bottom-10 -left-10 font-bold text-xl text-slate-200 rotate-180 print:-bottom-8 print:-left-8 print:text-lg">{studentNumber}</div>
                  <div className="absolute -bottom-10 -right-10 font-bold text-xl text-slate-200 rotate-180 print:-bottom-8 print:-right-8 print:text-lg">{studentNumber}</div>
  
                  <div className="w-full h-full grid grid-cols-5 grid-rows-5 border-[10px] border-black bg-black">
                    {grid.map((row, i) => 
                      row.map((isBlack, j) => (
                        <div key={`${i}-${j}`} className={isBlack ? 'bg-black' : 'bg-white rounded-[1px]'} />
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
