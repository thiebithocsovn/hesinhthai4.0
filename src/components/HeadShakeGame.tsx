import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, RefreshCw, Camera, AlertCircle, Clock, Star, Edit2, Plus, Trash2, Save, Search, ChevronDown, ChevronUp, Download, Upload, Sparkles, Check, Archive, X, Loader2, User, FolderPlus } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as XLSX from 'xlsx';
import { getConfiguredApiServer, postApiJson } from '../lib/api';
import { auth } from '../firebase';
import { createTeacherStorageKey } from '../lib/teacherIsolation';
import {
  generateOfflineHeadShakeQuestions,
  normalizeGeneratedHeadShakeQuestions,
  tryGenerateHeadShakeQuestionsWithBrowserAi,
  type GeneratedHeadShakeQuestion,
} from '../lib/headShakeQuestions';

interface HeadShakeGameProps {
  onBack: () => void;
}

interface Question {
  id: string;
  text: string;
  leftAnswer: string;
  leftMediaUrl?: string;
  leftMediaType?: 'none' | 'image' | 'video';
  rightAnswer: string;
  rightMediaUrl?: string;
  rightMediaType?: 'none' | 'image' | 'video';
  correctAnswer: 'left' | 'right';
  points: number;
  mediaUrl?: string;
  mediaType?: 'none' | 'image' | 'video';
}

export interface QuestionSet {
  id: string;
  name: string;
  questions: Question[];
  createdAt?: string;
  updatedAt?: string;
  isDefault?: boolean;
}

const RichTextEditor = ({ value, onChange, id, placeholder }: { value: string, onChange: (val: string) => void, id: string, placeholder: string }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div
      id={id}
      ref={editorRef}
      contentEditable
      onInput={handleInput}
      onBlur={handleInput}
      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-lg font-medium min-h-[100px] whitespace-pre-wrap empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400"
      data-placeholder={placeholder}
    />
  );
};

const THEMES = {
  default: 'bg-sky-50',
  blue: 'bg-blue-50',
  pink: 'bg-rose-50',
  yellow: 'bg-yellow-50'
};

const QUESTION_SETS: any[] = [];

export default function HeadShakeGame({ onBack }: HeadShakeGameProps) {
  const questionSetsStorageKey = createTeacherStorageKey('headshake_custom_sets', auth.currentUser?.uid);
  const selectedSetStorageKey = createTeacherStorageKey('headshake_selected_set', auth.currentUser?.uid);
  const [customSets, setCustomSets] = useState<QuestionSet[]>(() => {
    const saved = localStorage.getItem(questionSetsStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const filtered = parsed.filter((s: any) => s.name !== 'Bộ câu hỏi tùy chỉnh');
        if (filtered.length > 0) {
          return filtered;
        }
      } catch (e) {}
    }
    return [{
      id: 'default_custom',
      name: 'Bộ câu hỏi của tôi',
      questions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }];
  });

  const allSets = [...QUESTION_SETS.map(s => ({ ...s, isDefault: true })), ...customSets];

  const [selectedSetId, setSelectedSetId] = useState<string>(() => {
    const saved = localStorage.getItem(selectedSetStorageKey);
    return saved || 'default_custom';
  });

  const currentSet = allSets.find(s => s.id === selectedSetId) || allSets[0];
  const questions = currentSet.questions;

  const [gameState, setGameState] = useState<'setup' | 'playing' | 'result' | 'editor'>('setup');
  const [playMode, setPlayMode] = useState<'all' | 'random'>('all');
  const [randomCount, setRandomCount] = useState<number>(10);
  const [playQuestions, setPlayQuestions] = useState<Question[]>([]);
  const [theme, setTheme] = useState<keyof typeof THEMES>('default');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLimit, setTimeLimit] = useState(15);
  const [timeLeft, setTimeLeft] = useState(15);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [headDirection, setHeadDirection] = useState<'left' | 'right' | 'center'>('center');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationNotice, setGenerationNotice] = useState('');
  const [isCreateSetModalOpen, setIsCreateSetModalOpen] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameSetName, setRenameSetName] = useState('');

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const importedQuestions: Question[] = data.map((row: any) => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          text: row["Câu hỏi"] || "",
          leftAnswer: row["Đáp án Trái"] || "",
          rightAnswer: row["Đáp án Phải"] || "",
          correctAnswer: (row["Đáp án Đúng (left/right)"] === 'right' ? 'right' : 'left'),
          points: parseInt(row["Điểm số"]) || 10,
          mediaType: 'none',
          leftMediaType: 'none',
          rightMediaType: 'none'
        }));

        handleQuestionUpdate([...importedQuestions, ...questions]);
      } catch (error) {
        console.error("Lỗi khi đọc file Excel:", error);
        setErrorAlert("Đã xảy ra lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleExportExcel = () => {
    let exportData;
    if (questions.length === 0) {
      exportData = [{
        'STT': 1,
        'Câu hỏi': "Ví dụ: 1 + 1 = ?",
        'Đáp án Trái': "2",
        'Đáp án Phải': "3",
        'Đáp án Đúng (left/right)': "left",
        'Điểm số': 10
      }];
    } else {
      exportData = questions.map((q, index) => ({
        'STT': index + 1,
        'Câu hỏi': q.text.replace(/<[^>]*>?/gm, ''),
        'Đáp án Trái': q.leftAnswer.replace(/<[^>]*>?/gm, ''),
        'Đáp án Phải': q.rightAnswer.replace(/<[^>]*>?/gm, ''),
        'Đáp án Đúng (left/right)': q.correctAnswer,
        'Điểm số': q.points
      }));
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "HeadShakeGame_Questions.xlsx");
  };

  const handleGenerateAI = async () => {
    if (!aiTopic.trim()) return;
    setIsGenerating(true);
    setGenerationNotice('');
    try {
      const count = Math.max(1, Math.min(20, Math.trunc(aiCount) || 1));
      let generatedData: GeneratedHeadShakeQuestion[] = [];
      let generationSource: 'server' | 'browser-ai' | 'offline' = 'offline';
      const hasConfiguredServer = Boolean(getConfiguredApiServer());
      const canUseLocalServer = !window.location.hostname.endsWith('.github.io');

      if (hasConfiguredServer || canUseLocalServer) {
        try {
          const response = await postApiJson<unknown>('generate-questions', { topic: aiTopic.trim(), count });
          generatedData = normalizeGeneratedHeadShakeQuestions(response, count);
          if (generatedData.length > 0) generationSource = 'server';
        } catch (error) {
          console.info('Máy chủ AI chưa khả dụng, tiếp tục tạo câu hỏi trên thiết bị.', error);
        }
      }

      if (generatedData.length === 0) {
        generatedData = await tryGenerateHeadShakeQuestionsWithBrowserAi(aiTopic, count);
        if (generatedData.length > 0) generationSource = 'browser-ai';
      }

      if (generatedData.length === 0) {
        generatedData = generateOfflineHeadShakeQuestions(aiTopic, count);
        generationSource = 'offline';
      }

      if (generatedData.length === 0) {
        throw new Error('Chưa thể tạo câu hỏi. Vui lòng nhập chủ đề cụ thể hơn.');
      }

      const newQuestions: Question[] = generatedData.map((q) => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        text: q.text,
        leftAnswer: q.leftAnswer,
        rightAnswer: q.rightAnswer,
        correctAnswer: q.correctAnswer === 'right' ? 'right' : 'left',
        points: q.points || 10,
        mediaType: 'none',
        leftMediaType: 'none',
        rightMediaType: 'none'
      }));

      handleQuestionUpdate([...newQuestions, ...questions]);
      const sourceLabel = generationSource === 'server'
        ? 'máy chủ AI'
        : generationSource === 'browser-ai'
          ? 'AI có sẵn trong trình duyệt'
          : 'bộ tạo câu hỏi thông minh trên thiết bị';
      setGenerationNotice(`Đã tạo ${newQuestions.length} câu hỏi bằng ${sourceLabel}. Thầy cô có thể kiểm tra và chỉnh sửa từng câu trước khi sử dụng.`);
      setIsAiModalOpen(false);
      setAiTopic('');
    } catch (error) {
      console.error("Lỗi khi tạo câu hỏi bằng AI:", error);
      setErrorAlert(error instanceof Error ? error.message : "Đã xảy ra lỗi khi tạo câu hỏi. Vui lòng thử lại.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuestionUpdate = (newQuestions: Question[]) => {
    if (currentSet.isDefault) {
      const newSet: QuestionSet = {
        id: 'custom_' + Date.now(),
        name: currentSet.name + ' (Bản sao)',
        questions: newQuestions,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setCustomSets(prev => [...prev, newSet]);
      setSelectedSetId(newSet.id);
    } else {
      setCustomSets(prev => prev.map(s => {
        if (s.id === selectedSetId) {
          return { ...s, questions: newQuestions, updatedAt: new Date().toISOString() };
        }
        return s;
      }));
    }
  };

  useEffect(() => {
    localStorage.setItem(questionSetsStorageKey, JSON.stringify(customSets));
  }, [customSets, questionSetsStorageKey]);

  useEffect(() => {
    localStorage.setItem(selectedSetStorageKey, selectedSetId);
  }, [selectedSetId, selectedSetStorageKey]);
  
  // Use refs for state accessed in closures (requestAnimationFrame, setInterval)
  const currentIndexRef = useRef(0);
  const gameStateRef = useRef(gameState);
  
  useEffect(() => {
    currentIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Head tracking state
  const lastActionTime = useRef<number>(0);
  const rollHistory = useRef<number[]>([]);

  useEffect(() => {
    const loadModel = async () => {
      try {
        // Temporarily suppress console.info and console.log to hide the XNNPACK delegate message
        const originalConsoleInfo = console.info;
        const originalConsoleLog = console.log;
        const originalConsoleWarn = console.warn;
        
        const suppressLog = (originalFn: any) => (...args: any[]) => {
          const message = args[0];
          if (typeof message === 'string' && 
              (message.toLowerCase().includes('tensorflow lite xnnpack delegate') || 
               message.toLowerCase().includes('created tensorflow lite'))) {
            return;
          }
          originalFn(...args);
        };

        console.info = suppressLog(originalConsoleInfo);
        console.log = suppressLog(originalConsoleLog);
        console.warn = suppressLog(originalConsoleWarn);

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });

        // Restore console methods
        console.info = originalConsoleInfo;
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;

        faceLandmarkerRef.current = landmarker;
        setIsModelLoaded(true);
      } catch (err) {
        console.error("Error loading FaceLandmarker:", err);
      }
    };
    loadModel();

    return () => {
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          if (gameState === 'playing') {
            detectFace();
          }
        };
      }
      setCameraError(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setCameraError("Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const startGame = () => {
    let selectedQuestions = [...questions];
    if (playMode === 'random') {
      selectedQuestions.sort(() => Math.random() - 0.5);
      selectedQuestions = selectedQuestions.slice(0, Math.min(randomCount, questions.length));
    }
    setPlayQuestions(selectedQuestions);
    setGameState('playing');
    setCurrentQuestionIndex(0);
    setScore(0);
    setFeedback(null);
    setTimeLeft(timeLimit);
    startCamera();
    startTimer();
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleAnswer(null); // Timeout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number, fieldPrefix: '' | 'left' | 'right' = '') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorAlert('Kích thước file quá lớn. Vui lòng chọn file dưới 5MB.');
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];
    if (!validTypes.includes(file.type)) {
      setErrorAlert('Định dạng file không được hỗ trợ. Vui lòng chọn ảnh (JPG, PNG, GIF, WEBP) hoặc video (MP4, WEBM).');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const newQuestions = [...questions];
      const urlField = fieldPrefix ? `${fieldPrefix}MediaUrl` as keyof Question : 'mediaUrl';
      const typeField = fieldPrefix ? `${fieldPrefix}MediaType` as keyof Question : 'mediaType';
      
      (newQuestions[index] as any)[urlField] = reader.result as string;
      (newQuestions[index] as any)[typeField] = file.type.startsWith('video/') ? 'video' : 'image';
      handleQuestionUpdate(newQuestions);
    };
    reader.readAsDataURL(file);
  };

  const insertFormat = (elementId: string, index: number, type: 'sup' | 'sub' | 'frac', field: 'text' | 'leftAnswer' | 'rightAnswer') => {
    const editor = document.getElementById(elementId);
    if (!editor) return;

    editor.focus();
    
    let html = '';
    if (type === 'sup') {
      html = `<span class="inline-flex items-baseline mx-1"><span class="bg-[#eef2ff] min-w-[1.5rem] min-h-[1.5rem] text-center outline-none px-1 border border-blue-200 rounded-sm inline-block">&#8203;</span><sup class="bg-[#eef2ff] min-w-[1.2rem] min-h-[1.5rem] text-center outline-none px-1 border border-blue-200 rounded-sm inline-block ml-0.5">&#8203;</sup></span>`;
    } else if (type === 'sub') {
      html = `<span class="inline-flex items-baseline mx-1"><span class="bg-[#eef2ff] min-w-[1.5rem] min-h-[1.5rem] text-center outline-none px-1 border border-blue-200 rounded-sm inline-block">&#8203;</span><sub class="bg-[#eef2ff] min-w-[1.2rem] min-h-[1.5rem] text-center outline-none px-1 border border-blue-200 rounded-sm inline-block ml-0.5">&#8203;</sub></span>`;
    } else if (type === 'frac') {
      html = `<span class="inline-flex flex-col items-center align-middle mx-1 text-base"><span class="bg-[#eef2ff] min-w-[1.5rem] min-h-[1.5rem] text-center outline-none px-1 border border-blue-200 rounded-sm">&#8203;</span><span class="w-full h-[1.5px] bg-black my-0.5"></span><span class="bg-[#eef2ff] min-w-[1.5rem] min-h-[1.5rem] text-center outline-none px-1 border border-blue-200 rounded-sm">&#8203;</span></span>`;
    }

    document.execCommand('insertHTML', false, html);
    
    const newQuestions = [...questions];
    newQuestions[index][field] = editor.innerHTML;
    handleQuestionUpdate(newQuestions);
  };

  const handleAnswer = (answer: 'left' | 'right' | null) => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    const now = Date.now();
    if (now - lastActionTime.current < 2000 && answer !== null) return; // Cooldown 2 seconds, but allow timeout
    lastActionTime.current = now;

    const currentIdx = currentIndexRef.current;
    if (currentIdx >= playQuestions.length) return;

    const currentQuestion = playQuestions[currentIdx];
    const isCorrect = answer === currentQuestion.correctAnswer;
    
    if (answer === null) {
      setFeedback('incorrect');
    } else if (isCorrect) {
      setScore(s => s + (currentQuestion.points || 10));
      setFeedback('correct');
    } else {
      setFeedback('incorrect');
    }

    setTimeout(() => {
      setFeedback(null);
      setHeadDirection('center');
      if (currentIdx < playQuestions.length - 1) {
        setCurrentQuestionIndex(currentIdx + 1);
        setTimeLeft(timeLimit);
        startTimer();
      } else {
        setGameState('result');
        stopCamera();
      }
    }, 2000);
  };

  const detectFace = () => {
    if (!videoRef.current || !faceLandmarkerRef.current || gameStateRef.current !== 'playing') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.readyState >= 2) {
      const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());
      
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const landmarks = results.faceLandmarks[0];
            
            // Draw face mesh points (simplified)
            ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
            landmarks.forEach(point => {
              ctx.beginPath();
              ctx.arc(point.x * canvas.width, point.y * canvas.height, 1, 0, 2 * Math.PI);
              ctx.fill();
            });

            // Calculate head roll (tilt left/right)
            // We use the eyes to determine the angle
            const leftEye = landmarks[33];
            const rightEye = landmarks[263];
            
            // Calculate angle in radians, then convert to degrees
            const dx = rightEye.x - leftEye.x;
            const dy = rightEye.y - leftEye.y;
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            
            rollHistory.current.push(angle);
            if (rollHistory.current.length > 10) rollHistory.current.shift();

            // Only process answers if we are not showing feedback
            // Need to check feedback state, but since feedback is a state, we can't easily check it in this closure unless we use a ref.
            // Let's use lastActionTime to prevent multiple answers
            const now = Date.now();
            if (rollHistory.current.length === 10 && now - lastActionTime.current >= 2000) {
              const avgAngle = rollHistory.current.reduce((a, b) => a + b, 0) / 10;
              
              // Note: because the camera is mirrored (-scale-x-100), 
              // tilting head to the user's left means the image tilts right
              if (avgAngle > 15) {
                setHeadDirection('left');
                handleAnswer('left');
                rollHistory.current = [];
              } else if (avgAngle < -15) {
                setHeadDirection('right');
                handleAnswer('right');
                rollHistory.current = [];
              } else {
                setHeadDirection('center');
              }
            }
          } else {
            setHeadDirection('center');
          }
        }
      }
    }

    if (gameStateRef.current === 'playing') {
      requestRef.current = requestAnimationFrame(detectFace);
    }
  };

  useEffect(() => {
    if (gameState === 'playing' && isModelLoaded) {
      detectFace();
    }
  }, [gameState, isModelLoaded]);

  const currentQuestion = gameState === 'playing' || gameState === 'result' 
    ? (playQuestions[currentQuestionIndex] || playQuestions[0])
    : (questions[currentQuestionIndex] || questions[0]);

  return (
    <div className={`flex flex-col h-full ${THEMES[theme]} font-sans transition-colors duration-500`}>
      <header className="px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-slate-800">Nghiêng Đầu Chọn Đáp Án</h1>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 md:p-8 flex flex-col items-center justify-center">
        {gameState === 'setup' && (
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-lg border border-slate-50 text-center">
            <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Camera className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Sẵn sàng chơi?</h2>
            <p className="text-slate-600 mb-8">
              Trò chơi sử dụng camera để nhận diện cử chỉ khuôn mặt của bạn.
              <br/><br/>
              <strong>Nghiêng đầu sang TRÁI</strong> = Chọn đáp án bên trái<br/>
              <strong>Nghiêng đầu sang PHẢI</strong> = Chọn đáp án bên phải
            </p>
            
            {cameraError && (
              <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3 text-left text-sm">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}

            <div className="mb-6 text-left">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Archive className="w-4 h-4 text-indigo-500" />
                Bộ câu hỏi
              </label>
              <select
                value={selectedSetId}
                onChange={(e) => setSelectedSetId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-lg font-medium"
              >
                {allSets.map(set => (
                  <option key={set.id} value={set.id}>{set.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-6 text-left">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald-500" />
                Chế độ chơi
              </label>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setPlayMode('all')}
                  className={`flex-1 py-2 px-3 rounded-lg border font-medium text-sm transition-colors ${playMode === 'all' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  Chơi tất cả ({questions.length} câu)
                </button>
                <button
                  onClick={() => setPlayMode('random')}
                  className={`flex-1 py-2 px-3 rounded-lg border font-medium text-sm transition-colors ${playMode === 'random' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  Bốc ngẫu nhiên
                </button>
              </div>
              
              {playMode === 'random' && (
                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 mb-3">
                  <span className="text-sm text-slate-600 font-medium">Số câu hỏi:</span>
                  <input
                    type="number"
                    min="1"
                    max={questions.length}
                    value={randomCount}
                    onChange={(e) => setRandomCount(Math.min(questions.length, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-20 px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-center font-bold text-slate-700"
                  />
                  <span className="text-sm text-slate-500">/ {questions.length}</span>
                </div>
              )}

              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-sm text-slate-600 font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  Thời gian mỗi câu:
                </span>
                <select
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                  className="w-24 px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-center font-bold text-slate-700"
                >
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                  <option value={15}>15s</option>
                  <option value={20}>20s</option>
                  <option value={30}>30s</option>
                  <option value={45}>45s</option>
                  <option value={60}>60s</option>
                </select>
              </div>
            </div>

            <div className="mb-6 text-left">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                Tên học sinh
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Nhập tên của em..."
                  className="w-full px-4 py-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-lg font-medium"
                />
                {playerName && (
                  <button 
                    onClick={() => setPlayerName('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              {!playerName.trim() && (
                <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Vui lòng nhập tên học sinh để bắt đầu
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={startGame}
                disabled={!isModelLoaded || questions.length === 0 || !playerName.trim()}
                className="w-full py-4 px-4 bg-[#5CB85C] hover:bg-[#4cae4c] text-white font-bold text-xl rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                title={!playerName.trim() ? "Vui lòng nhập tên học sinh để bắt đầu" : ""}
              >
                {isModelLoaded ? (
                  <>
                    <Play className="w-6 h-6" />
                    Bắt đầu chơi
                  </>
                ) : (
                  'Đang tải mô hình AI...'
                )}
              </button>
              
              <button
                onClick={() => setGameState('editor')}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors flex items-center justify-center gap-2"
              >
                <Edit2 className="w-5 h-5" />
                Biên soạn câu hỏi ({questions.length})
              </button>
            </div>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="w-full max-w-5xl flex flex-col items-center">
            {/* Top Stats Bar */}
            <div className="w-full flex flex-wrap justify-between items-center mb-6 px-4 gap-4">
              {playerName && (
                <div className="flex items-center gap-2 text-lg font-bold text-indigo-600 order-last md:order-first w-full md:w-auto justify-center md:justify-start">
                  <User className="w-5 h-5" /> {playerName}
                </div>
              )}
              <div className="flex items-center gap-2 text-xl font-bold text-slate-700">
                <span className="text-yellow-500 text-2xl">☀️</span> Điểm: {score}
              </div>
              <div className="flex items-center gap-2 text-xl font-bold text-slate-700">
                <Clock className="text-yellow-500 w-6 h-6" /> {timeLeft}s
              </div>
              <div className="text-xl font-bold text-slate-700">
                Câu: {currentQuestionIndex + 1}/{playQuestions.length}
              </div>
            </div>

            {/* Question Box */}
            <div className="w-full bg-white rounded-3xl p-8 mb-8 text-center relative flex flex-col items-center justify-center min-h-[200px]">
              {currentQuestion.mediaUrl && currentQuestion.mediaType === 'image' && (
                <img src={currentQuestion.mediaUrl} alt="Question media" className="max-h-48 rounded-xl mb-6 object-contain" />
              )}
              {currentQuestion.mediaUrl && currentQuestion.mediaType === 'video' && (
                <video src={currentQuestion.mediaUrl} controls autoPlay className="max-h-48 rounded-xl mb-6" />
              )}
              <h2 
                className="text-4xl md:text-5xl font-bold text-slate-800 whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: currentQuestion.text }}
              />
              <div className="absolute top-4 right-4 bg-yellow-100 text-yellow-700 px-4 py-1.5 rounded-full font-bold shadow-sm">
                {currentQuestion.points || 10} điểm
              </div>
            </div>

            {/* Answers and Camera Area */}
            <div className="w-full flex justify-between items-end relative h-64 md:h-80">
              {/* Left Answer */}
              <div 
                className={`w-1/3 h-full rounded-3xl flex flex-col items-center justify-center text-2xl md:text-3xl lg:text-4xl font-bold text-white shadow-md transition-all duration-300 p-4 overflow-hidden ${
                  feedback === 'correct' && currentQuestion.correctAnswer === 'left' ? 'bg-emerald-500 scale-105' : 
                  feedback === 'incorrect' && headDirection === 'left' ? 'bg-red-500 scale-95' : 
                  headDirection === 'left' ? 'bg-[#4cae4c] scale-105 ring-4 ring-emerald-300' : 'bg-[#5CB85C]'
                }`}
              >
                {currentQuestion.leftMediaUrl && currentQuestion.leftMediaType === 'image' && (
                  <img src={currentQuestion.leftMediaUrl} alt="Left Answer" className="max-h-32 mb-4 rounded-xl object-contain" />
                )}
                {currentQuestion.leftMediaUrl && currentQuestion.leftMediaType === 'video' && (
                  <video src={currentQuestion.leftMediaUrl} autoPlay loop muted className="max-h-32 mb-4 rounded-xl" />
                )}
                <div className="w-full break-words overflow-wrap-anywhere hyphens-auto text-center" dangerouslySetInnerHTML={{ __html: currentQuestion.leftAnswer }} />
              </div>

              {/* Center Camera Area */}
              <div className="w-1/4 h-48 md:h-56 relative z-10 flex flex-col items-center justify-end pb-4">
                {/* Direction Indicator */}
                {!feedback && headDirection !== 'center' && (
                  <div className="absolute -top-12 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full font-bold text-blue-600 shadow-sm animate-bounce">
                    👉 Đang nghiêng {headDirection === 'left' ? 'TRÁI' : 'PHẢI'}
                  </div>
                )}

                {/* Feedback Star */}
                {feedback && (
                  <div className="absolute -top-16 z-20 animate-in zoom-in duration-300">
                    <div className="relative">
                      <Star className={`w-24 h-24 ${feedback === 'correct' ? 'text-yellow-400 fill-yellow-400' : 'text-slate-400 fill-slate-400'}`} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-black/60 text-white px-3 py-1 rounded-full text-lg font-bold whitespace-nowrap">
                          {feedback === 'correct' ? 'Giỏi lắm!' : 'Sai rồi!'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Camera Feed */}
                <div className="w-full aspect-square bg-slate-200 rounded-3xl overflow-hidden border-4 border-white shadow-lg relative">
                  <video 
                    ref={videoRef} 
                    className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" 
                    playsInline 
                    muted 
                  />
                  <canvas 
                    ref={canvasRef} 
                    className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none"
                    width={640}
                    height={480}
                  />
                </div>
                <div className="text-slate-500 text-sm mt-2 font-medium">Camera của em</div>
              </div>

              {/* Right Answer */}
              <div 
                className={`w-1/3 h-full rounded-3xl flex flex-col items-center justify-center text-2xl md:text-3xl lg:text-4xl font-bold text-white shadow-md transition-all duration-300 p-4 overflow-hidden ${
                  feedback === 'correct' && currentQuestion.correctAnswer === 'right' ? 'bg-emerald-500 scale-105' : 
                  feedback === 'incorrect' && headDirection === 'right' ? 'bg-red-500 scale-95' : 
                  headDirection === 'right' ? 'bg-[#4cae4c] scale-105 ring-4 ring-emerald-300' : 'bg-[#5CB85C]'
                }`}
              >
                {currentQuestion.rightMediaUrl && currentQuestion.rightMediaType === 'image' && (
                  <img src={currentQuestion.rightMediaUrl} alt="Right Answer" className="max-h-32 mb-4 rounded-xl object-contain" />
                )}
                {currentQuestion.rightMediaUrl && currentQuestion.rightMediaType === 'video' && (
                  <video src={currentQuestion.rightMediaUrl} autoPlay loop muted className="max-h-32 mb-4 rounded-xl" />
                )}
                <div className="w-full break-words overflow-wrap-anywhere hyphens-auto text-center" dangerouslySetInnerHTML={{ __html: currentQuestion.rightAnswer }} />
              </div>
            </div>
          </div>
        )}

        {gameState === 'result' && (
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center">
            <div className="w-32 h-32 bg-yellow-100 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6 relative">
              <Star className="w-20 h-20 fill-yellow-500" />
              <span className="absolute text-3xl font-black text-white mt-2">{score}</span>
            </div>
            <h2 className="text-3xl font-bold text-slate-800 mb-2">
              {playerName ? `Chúc mừng ${playerName}!` : 'Hoàn thành!'}
            </h2>
            <p className="text-slate-600 mb-8 text-lg">
              Bạn đã trả lời đúng {score} trên tổng số {playQuestions.length} câu hỏi.
            </p>
            
            <div className="flex gap-4">
              <button
                onClick={() => setGameState('setup')}
                className="flex-1 py-4 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg rounded-2xl transition-colors"
              >
                Quay lại
              </button>
              <button
                onClick={startGame}
                className="flex-1 py-4 px-4 bg-[#5CB85C] hover:bg-[#4cae4c] text-white font-bold text-lg rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-md"
              >
                <RefreshCw className="w-5 h-5" />
                Chơi lại
              </button>
            </div>
          </div>
        )}

        {gameState === 'editor' && (
          <div className="w-full max-w-6xl bg-[#f3f4f6] rounded-3xl shadow-sm border border-slate-200 flex flex-col h-[85vh] overflow-hidden">
            {/* Header */}
            <div className="p-6 bg-white border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Archive className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedSetId}
                      onChange={(e) => setSelectedSetId(e.target.value)}
                      className="text-xl font-bold text-slate-800 bg-transparent border-none outline-none cursor-pointer hover:bg-slate-100 rounded px-1 -ml-1"
                    >
                      {allSets.map(set => (
                        <option key={set.id} value={set.id}>{set.name}</option>
                      ))}
                    </select>
                    {!currentSet.isDefault && (
                      <button
                        onClick={() => {
                          setRenameSetName(currentSet.name);
                          setIsRenameModalOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Đổi tên bộ câu hỏi"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <span className="text-sm text-slate-500">
                    {questions.length} / 1000 câu
                  </span>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setIsCreateSetModalOpen(true)}
                  className="py-2 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm"
                >
                  <FolderPlus className="w-4 h-4" />
                  TẠO BỘ CÂU HỎI
                </button>
                {!currentSet.isDefault && (
                  <button
                    onClick={() => setIsDeleteConfirmOpen(true)}
                    className="py-2 px-4 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-semibold rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm"
                    title="Xóa bộ câu hỏi này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    const newId = Date.now().toString();
                    handleQuestionUpdate([
                      {
                        id: newId,
                        text: '',
                        leftAnswer: '',
                        rightAnswer: '',
                        correctAnswer: 'left',
                        points: 10,
                        mediaType: 'none',
                        leftMediaType: 'none',
                        rightMediaType: 'none'
                      },
                      ...questions
                    ]);
                    setExpandedQuestions(new Set(expandedQuestions).add(newId));
                  }}
                  className="py-2 px-4 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  TẠO CÂU HỎI MỚI
                </button>
                <button 
                  onClick={() => setIsAiModalOpen(true)}
                  className="py-2 px-4 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 font-semibold rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  TẠO BẰNG AI
                </button>
                <button 
                  onClick={handleExportExcel}
                  className="py-2 px-4 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 font-semibold rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  XUẤT MẪU
                </button>
                <label className="py-2 px-4 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 font-semibold rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm cursor-pointer">
                  <Upload className="w-4 h-4" />
                  NHẬP EXCEL
                  <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleImportExcel} />
                </label>
                <button
                  onClick={() => setGameState('setup')}
                  className="py-2 px-4 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm ml-2"
                >
                  <Save className="w-4 h-4" />
                  Lưu & Đóng
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {/* Search Bar */}
              <div className="mb-6 relative max-w-md">
                <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm kiếm câu hỏi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                />
              </div>

              {/* Create Set Modal */}
              {isCreateSetModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <FolderPlus className="w-5 h-5 text-emerald-600" />
                        Tạo bộ câu hỏi mới
                      </h3>
                      <button 
                        onClick={() => setIsCreateSetModalOpen(false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Tên bộ câu hỏi
                        </label>
                        <input
                          type="text"
                          value={newSetName}
                          onChange={(e) => setNewSetName(e.target.value)}
                          placeholder="Nhập tên bộ câu hỏi..."
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:emerald-500 focus:border-emerald-500 outline-none transition-all"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newSetName.trim()) {
                              const newSet: QuestionSet = {
                                id: 'custom_' + Date.now(),
                                name: newSetName.trim(),
                                questions: [],
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                              };
                              setCustomSets(prev => [...prev, newSet]);
                              setSelectedSetId(newSet.id);
                              setNewSetName('');
                              setIsCreateSetModalOpen(false);
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                      <button
                        onClick={() => setIsCreateSetModalOpen(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={() => {
                          if (newSetName.trim()) {
                            const newSet: QuestionSet = {
                              id: 'custom_' + Date.now(),
                              name: newSetName.trim(),
                              questions: [],
                              createdAt: new Date().toISOString(),
                              updatedAt: new Date().toISOString()
                            };
                            setCustomSets(prev => [...prev, newSet]);
                            setSelectedSetId(newSet.id);
                            setNewSetName('');
                            setIsCreateSetModalOpen(false);
                          }
                        }}
                        disabled={!newSetName.trim()}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <FolderPlus className="w-4 h-4" />
                        Tạo mới
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Rename Modal */}
              {isRenameModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Edit2 className="w-5 h-5 text-indigo-600" />
                        Đổi tên bộ câu hỏi
                      </h3>
                      <button 
                        onClick={() => setIsRenameModalOpen(false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Tên bộ câu hỏi
                        </label>
                        <input
                          type="text"
                          value={renameSetName}
                          onChange={(e) => setRenameSetName(e.target.value)}
                          placeholder="Nhập tên bộ câu hỏi..."
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:indigo-500 focus:border-indigo-500 outline-none transition-all"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && renameSetName.trim()) {
                              setCustomSets(prev => prev.map(s => s.id === selectedSetId ? { ...s, name: renameSetName.trim() } : s));
                              setIsRenameModalOpen(false);
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                      <button
                        onClick={() => setIsRenameModalOpen(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={() => {
                          if (renameSetName.trim()) {
                            setCustomSets(prev => prev.map(s => s.id === selectedSetId ? { ...s, name: renameSetName.trim() } : s));
                            setIsRenameModalOpen(false);
                          }
                        }}
                        disabled={!renameSetName.trim()}
                        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        Lưu thay đổi
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete Confirm Modal */}
              {isDeleteConfirmOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-red-50">
                      <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
                        <Trash2 className="w-5 h-5 text-red-600" />
                        Xác nhận xóa
                      </h3>
                      <button 
                        onClick={() => setIsDeleteConfirmOpen(false)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="p-6">
                      <p className="text-slate-700">
                        Bạn có chắc chắn muốn xóa bộ câu hỏi <span className="font-bold">"{currentSet.name}"</span> không? Hành động này không thể hoàn tác.
                      </p>
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                      <button
                        onClick={() => setIsDeleteConfirmOpen(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={() => {
                          setCustomSets(prev => {
                            const newSets = prev.filter(s => s.id !== selectedSetId);
                            if (newSets.length === 0) {
                              return [{
                                id: 'default_custom',
                                name: 'Bộ câu hỏi của tôi',
                                questions: [],
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                              }];
                            }
                            return newSets;
                          });
                          setSelectedSetId('default_custom');
                          setIsDeleteConfirmOpen(false);
                        }}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                        Xóa
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Modal */}
              {isAiModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-600" />
                        Tạo câu hỏi bằng AI
                      </h3>
                      <button 
                        onClick={() => setIsAiModalOpen(false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Chủ đề
                        </label>
                        <input
                          type="text"
                          value={aiTopic}
                          onChange={(e) => setAiTopic(e.target.value)}
                          placeholder="VD: Toán lớp 1, Lịch sử Việt Nam..."
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Số lượng câu hỏi
                        </label>
                        <input
                          type="number"
                          value={aiCount}
                          onChange={(e) => setAiCount(parseInt(e.target.value) || 1)}
                          min="1"
                          max="20"
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                      <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-800">
                        Hoạt động ngay trên GitHub Pages. Ứng dụng ưu tiên máy chủ AI đã cấu hình hoặc AI có sẵn trong trình duyệt; khi chưa có, câu hỏi được tạo tự động theo môn học ngay trên thiết bị.
                      </p>
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                      <button
                        onClick={() => setIsAiModalOpen(false)}
                        className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={handleGenerateAI}
                        disabled={isGenerating || !aiTopic.trim()}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Đang tạo...
                          </>
                        ) : (
                          'Tạo câu hỏi'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Alert Modal */}
              {errorAlert && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-red-50">
                      <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
                        <Trash2 className="w-5 h-5 text-red-600" />
                        Lỗi
                      </h3>
                      <button 
                        onClick={() => setErrorAlert(null)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="p-6">
                      <p className="text-slate-700">
                        {errorAlert}
                      </p>
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
                      <button
                        onClick={() => setErrorAlert(null)}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-medium transition-colors"
                      >
                        Đóng
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {generationNotice && (
                <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <div className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{generationNotice}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGenerationNotice('')}
                    className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                    aria-label="Đóng thông báo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[auto_1fr_auto] gap-4 p-4 border-b border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <div className="flex items-center justify-center w-8">
                    <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  </div>
                  <div>Câu hỏi</div>
                  <div className="text-right pr-12">Đáp án đúng</div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-slate-100">
                  {questions.filter(q => q.text.toLowerCase().includes(searchQuery.toLowerCase())).map((q, index) => {
                    const isExpanded = expandedQuestions.has(q.id);
                    
                    // Strip HTML tags for display
                    const stripHtml = (html: string) => {
                      const doc = new DOMParser().parseFromString(html, 'text/html');
                      return doc.body.textContent || "";
                    };
                    
                    const displayQuestion = stripHtml(q.text) || "(Chưa có nội dung)";
                    const displayAnswer = q.correctAnswer === 'left' ? stripHtml(q.leftAnswer) : stripHtml(q.rightAnswer);
                    
                    return (
                      <div key={q.id} className="flex flex-col">
                        {/* Row */}
                        <div 
                          className={`grid grid-cols-[auto_1fr_auto] gap-4 p-4 items-center transition-colors hover:bg-slate-50 ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                        >
                          <div className="flex items-center justify-center w-8">
                            <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                          </div>
                          <div className="text-sm font-medium text-slate-700 truncate pr-4">
                            {displayQuestion}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="px-2.5 py-1 bg-emerald-500 text-white text-xs font-medium rounded flex items-center gap-1.5 shadow-sm">
                              <Check className="w-3 h-3" />
                              <span className="truncate max-w-[100px]">{displayAnswer || "(Trống)"}</span>
                            </div>
                            <button
                              onClick={() => {
                                const newQuestions = [...questions];
                                newQuestions.splice(index, 1);
                                handleQuestionUpdate(newQuestions);
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Xóa câu hỏi"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                const newExpanded = new Set(expandedQuestions);
                                if (isExpanded) {
                                  newExpanded.delete(q.id);
                                } else {
                                  newExpanded.add(q.id);
                                }
                                setExpandedQuestions(newExpanded);
                              }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Content (Editor) */}
                        {isExpanded && (
                          <div className="p-6 bg-slate-50 border-t border-slate-100">
                            {/* The existing editor form goes here */}
                            <div className="mb-4 flex flex-col md:flex-row gap-4">
                              <div className="flex-1">
                                <div className="flex justify-between items-end mb-2">
                                  <label className="block text-sm font-bold text-slate-700">
                                    Nội dung câu hỏi
                                  </label>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => insertFormat(`question-${index}`, index, 'sup', 'text')}
                                      className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded transition-colors flex items-center justify-center font-serif italic font-bold text-slate-700 w-8 h-8"
                                      title="Chỉ số trên"
                                    >
                                      x<sup className="text-[10px] ml-0.5">2</sup>
                                    </button>
                                    <button
                                      onClick={() => insertFormat(`question-${index}`, index, 'sub', 'text')}
                                      className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded transition-colors flex items-center justify-center font-serif italic font-bold text-slate-700 w-8 h-8"
                                      title="Chỉ số dưới"
                                    >
                                      x<sub className="text-[10px] ml-0.5">2</sub>
                                    </button>
                                    <button
                                      onClick={() => insertFormat(`question-${index}`, index, 'frac', 'text')}
                                      className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded transition-colors flex items-center justify-center font-serif italic font-bold text-slate-700 w-8 h-8 flex-col text-[10px] leading-none"
                                      title="Phân số"
                                    >
                                      <span>a</span>
                                      <span className="w-3 h-[1.5px] bg-slate-700 my-[1px]"></span>
                                      <span>b</span>
                                    </button>
                                  </div>
                                </div>
                                <RichTextEditor
                                  id={`question-${index}`}
                                  value={q.text}
                                  onChange={(val) => {
                                    const newQuestions = [...questions];
                                    newQuestions[index].text = val;
                                    handleQuestionUpdate(newQuestions);
                                  }}
                                  placeholder="Nhập hoặc dán nội dung câu hỏi, công thức toán học..."
                                />
                              </div>
                              <div className="w-full md:w-32">
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                  Điểm số
                                </label>
                                <input
                                  type="number"
                                  value={q.points || 10}
                                  onChange={(e) => {
                                    const newQuestions = [...questions];
                                    newQuestions[index].points = parseInt(e.target.value) || 0;
                                    handleQuestionUpdate(newQuestions);
                                  }}
                                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-lg font-bold text-center"
                                  min="1"
                                />
                              </div>
                            </div>
                            
                            <div className="mb-6">
                              <label className="block text-sm font-bold text-slate-700 mb-2">
                                Đính kèm (Tùy chọn)
                              </label>
                              <div className="flex items-center gap-4">
                                <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium rounded-xl transition-colors">
                                  <input 
                                    type="file" 
                                    accept="image/*,video/*" 
                                    className="hidden" 
                                    onChange={(e) => handleFileUpload(e, index)} 
                                  />
                                  <Camera className="w-5 h-5" />
                                  Thêm hình ảnh / video
                                </label>
                                {q.mediaUrl && (
                                  <button
                                    onClick={() => {
                                      const newQuestions = [...questions];
                                      newQuestions[index].mediaUrl = undefined;
                                      newQuestions[index].mediaType = 'none';
                                      handleQuestionUpdate(newQuestions);
                                    }}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                    title="Xóa đính kèm"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                )}
                              </div>
                              {q.mediaUrl && q.mediaType === 'image' && (
                                <img src={q.mediaUrl} alt="Preview" className="mt-4 max-h-48 rounded-xl object-contain border border-slate-200 bg-white" />
                              )}
                              {q.mediaUrl && q.mediaType === 'video' && (
                                <video src={q.mediaUrl} controls className="mt-4 max-h-48 rounded-xl border border-slate-200 bg-black" />
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Left Answer */}
                              <div className={`p-4 rounded-xl border-2 transition-colors ${q.correctAnswer === 'left' ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                                <div className="flex justify-between items-center mb-3">
                                  <label className="text-sm font-bold text-slate-700">Đáp án TRÁI</label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`correct-${q.id}`}
                                      checked={q.correctAnswer === 'left'}
                                      onChange={() => {
                                        const newQuestions = [...questions];
                                        newQuestions[index].correctAnswer = 'left';
                                        handleQuestionUpdate(newQuestions);
                                      }}
                                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm font-medium text-slate-600">Là đáp án đúng</span>
                                  </label>
                                </div>
                                <div className="flex gap-1 mb-2 justify-end">
                                    <button
                                      onClick={() => insertFormat(`left-answer-${index}`, index, 'sup', 'leftAnswer')}
                                      className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded transition-colors flex items-center justify-center font-serif italic font-bold text-slate-700 w-8 h-8"
                                      title="Chỉ số trên"
                                    >
                                      x<sup className="text-[10px] ml-0.5">2</sup>
                                    </button>
                                    <button
                                      onClick={() => insertFormat(`left-answer-${index}`, index, 'sub', 'leftAnswer')}
                                      className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded transition-colors flex items-center justify-center font-serif italic font-bold text-slate-700 w-8 h-8"
                                      title="Chỉ số dưới"
                                    >
                                      x<sub className="text-[10px] ml-0.5">2</sub>
                                    </button>
                                    <button
                                      onClick={() => insertFormat(`left-answer-${index}`, index, 'frac', 'leftAnswer')}
                                      className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded transition-colors flex items-center justify-center font-serif italic font-bold text-slate-700 w-8 h-8 flex-col text-[10px] leading-none"
                                      title="Phân số"
                                    >
                                      <span>a</span>
                                      <span className="w-3 h-[1.5px] bg-slate-700 my-[1px]"></span>
                                      <span>b</span>
                                    </button>
                                </div>
                                <RichTextEditor
                                  id={`left-answer-${index}`}
                                  value={q.leftAnswer}
                                  onChange={(val) => {
                                    const newQuestions = [...questions];
                                    newQuestions[index].leftAnswer = val;
                                    handleQuestionUpdate(newQuestions);
                                  }}
                                  placeholder="Nhập đáp án..."
                                />
                                <div className="mt-3 flex items-center gap-3">
                                  <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors text-sm font-medium">
                                    <input 
                                      type="file" 
                                      accept="image/*,video/*" 
                                      className="hidden" 
                                      onChange={(e) => handleFileUpload(e, index, 'left')} 
                                    />
                                    <Camera className="w-4 h-4" />
                                    Chọn tệp
                                  </label>
                                  <span className="text-xs text-slate-500 truncate max-w-[150px]">
                                    {q.leftMediaUrl ? 'Đã chọn tệp' : 'Không có tệp nào được chọn'}
                                  </span>
                                  {q.leftMediaUrl && (
                                    <button
                                      onClick={() => {
                                        const newQuestions = [...questions];
                                        newQuestions[index].leftMediaUrl = undefined;
                                        newQuestions[index].leftMediaType = 'none';
                                        handleQuestionUpdate(newQuestions);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Xóa tệp"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                                {q.leftMediaUrl && q.leftMediaType === 'image' && (
                                  <img src={q.leftMediaUrl} alt="Preview" className="mt-3 max-h-32 rounded-lg object-contain border border-slate-200 w-full bg-white" />
                                )}
                                {q.leftMediaUrl && q.leftMediaType === 'video' && (
                                  <video src={q.leftMediaUrl} controls className="mt-3 max-h-32 rounded-lg border border-slate-200 w-full bg-black" />
                                )}
                              </div>
                              
                              {/* Right Answer */}
                              <div className={`p-4 rounded-xl border-2 transition-colors ${q.correctAnswer === 'right' ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                                <div className="flex justify-between items-center mb-3">
                                  <label className="text-sm font-bold text-slate-700">Đáp án PHẢI</label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`correct-${q.id}`}
                                      checked={q.correctAnswer === 'right'}
                                      onChange={() => {
                                        const newQuestions = [...questions];
                                        newQuestions[index].correctAnswer = 'right';
                                        handleQuestionUpdate(newQuestions);
                                      }}
                                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm font-medium text-slate-600">Là đáp án đúng</span>
                                  </label>
                                </div>
                                <div className="flex gap-1 mb-2 justify-end">
                                    <button
                                      onClick={() => insertFormat(`right-answer-${index}`, index, 'sup', 'rightAnswer')}
                                      className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded transition-colors flex items-center justify-center font-serif italic font-bold text-slate-700 w-8 h-8"
                                      title="Chỉ số trên"
                                    >
                                      x<sup className="text-[10px] ml-0.5">2</sup>
                                    </button>
                                    <button
                                      onClick={() => insertFormat(`right-answer-${index}`, index, 'sub', 'rightAnswer')}
                                      className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded transition-colors flex items-center justify-center font-serif italic font-bold text-slate-700 w-8 h-8"
                                      title="Chỉ số dưới"
                                    >
                                      x<sub className="text-[10px] ml-0.5">2</sub>
                                    </button>
                                    <button
                                      onClick={() => insertFormat(`right-answer-${index}`, index, 'frac', 'rightAnswer')}
                                      className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded transition-colors flex items-center justify-center font-serif italic font-bold text-slate-700 w-8 h-8 flex-col text-[10px] leading-none"
                                      title="Phân số"
                                    >
                                      <span>a</span>
                                      <span className="w-3 h-[1.5px] bg-slate-700 my-[1px]"></span>
                                      <span>b</span>
                                    </button>
                                </div>
                                <RichTextEditor
                                  id={`right-answer-${index}`}
                                  value={q.rightAnswer}
                                  onChange={(val) => {
                                    const newQuestions = [...questions];
                                    newQuestions[index].rightAnswer = val;
                                    handleQuestionUpdate(newQuestions);
                                  }}
                                  placeholder="Nhập đáp án..."
                                />
                                <div className="mt-3 flex items-center gap-3">
                                  <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors text-sm font-medium">
                                    <input 
                                      type="file" 
                                      accept="image/*,video/*" 
                                      className="hidden" 
                                      onChange={(e) => handleFileUpload(e, index, 'right')} 
                                    />
                                    <Camera className="w-4 h-4" />
                                    Chọn tệp
                                  </label>
                                  <span className="text-xs text-slate-500 truncate max-w-[150px]">
                                    {q.rightMediaUrl ? 'Đã chọn tệp' : 'Không có tệp nào được chọn'}
                                  </span>
                                  {q.rightMediaUrl && (
                                    <button
                                      onClick={() => {
                                        const newQuestions = [...questions];
                                        newQuestions[index].rightMediaUrl = undefined;
                                        newQuestions[index].rightMediaType = 'none';
                                        handleQuestionUpdate(newQuestions);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Xóa tệp"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                                {q.rightMediaUrl && q.rightMediaType === 'image' && (
                                  <img src={q.rightMediaUrl} alt="Preview" className="mt-3 max-h-32 rounded-lg object-contain border border-slate-200 w-full bg-white" />
                                )}
                                {q.rightMediaUrl && q.rightMediaType === 'video' && (
                                  <video src={q.rightMediaUrl} controls className="mt-3 max-h-32 rounded-lg border border-slate-200 w-full bg-black" />
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {questions.filter(q => q.text.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                      Không tìm thấy câu hỏi nào phù hợp.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
