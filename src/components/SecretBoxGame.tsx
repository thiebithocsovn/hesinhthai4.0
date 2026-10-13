import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Upload, Plus, Trash2, Play, Settings, Image as ImageIcon, Type, Users, CheckCircle, XCircle, SkipForward, Trophy, Eye, Gift } from 'lucide-react';
import { auth } from '../firebase';
import { createTeacherStorageKey } from '../lib/teacherIsolation';

interface Question {
  id: string;
  text: string;
  answer: string;
}

interface Team {
  id: string;
  name: string;
  score: number;
}

interface GameConfig {
  title: string;
  secretType: 'image' | 'keyword';
  secretImage: string | null;
  secretKeyword: string;
  gridSize: 3 | 4 | 5;
  questions: Question[];
  pointsPerQuestion: number;
  pointsForSecret: number;
  revealMode: 'random' | 'manual';
  teams: Team[];
}

interface SecretBoxGameProps {
  onBack: () => void;
}

const DEFAULT_CONFIG: GameConfig = {
  title: 'Khám phá ô chữ bí mật',
  secretType: 'image',
  secretImage: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=1000&auto=format&fit=crop',
  secretKeyword: 'GIÁO DỤC',
  gridSize: 3,
  pointsPerQuestion: 10,
  pointsForSecret: 50,
  revealMode: 'random',
  teams: [
    { id: '1', name: 'Đội 1', score: 0 },
    { id: '2', name: 'Đội 2', score: 0 }
  ],
  questions: [
    { id: '1', text: 'Thủ đô của Việt Nam là gì?', answer: 'Hà Nội' },
    { id: '2', text: 'Hành tinh nào gần Mặt Trời nhất?', answer: 'Sao Thủy' },
    { id: '3', text: 'Ai là người tìm ra châu Mỹ?', answer: 'Christopher Columbus' },
    { id: '4', text: 'Đỉnh núi cao nhất thế giới tên là gì?', answer: 'Everest' },
    { id: '5', text: 'Nước nào có diện tích lớn nhất thế giới?', answer: 'Nga' },
    { id: '6', text: 'Đại dương nào lớn nhất thế giới?', answer: 'Thái Bình Dương' },
    { id: '7', text: 'Loài vật nào lớn nhất hành tinh?', answer: 'Cá voi xanh' },
    { id: '8', text: 'Tác giả của Truyện Kiều là ai?', answer: 'Nguyễn Du' },
    { id: '9', text: 'Quốc hoa của Việt Nam là hoa gì?', answer: 'Hoa sen' }
  ]
};

export default function SecretBoxGame({ onBack }: SecretBoxGameProps) {
  const configStorageKey = createTeacherStorageKey('secretBoxConfig', auth.currentUser?.uid);
  const [status, setStatus] = useState<'setup' | 'playing' | 'finished'>('setup');
  const [config, setConfig] = useState<GameConfig>(() => {
    const saved = localStorage.getItem(configStorageKey);
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });

  const [revealedTiles, setRevealedTiles] = useState<number[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [winnerTeamId, setWinnerTeamId] = useState<string | null>(null);
  const [secretGuess, setSecretGuess] = useState('');
  const [guessingTeamId, setGuessingTeamId] = useState<string>('');
  const [answeringTeamId, setAnsweringTeamId] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(configStorageKey, JSON.stringify(config));
  }, [config, configStorageKey]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setConfig({ ...config, secretImage: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const startGame = () => {
    setRevealedTiles([]);
    setCurrentQuestionIndex(0);
    setWinnerTeamId(null);
    setSecretGuess('');
    setGuessingTeamId(config.teams[0]?.id || '');
    setAnsweringTeamId(config.teams[0]?.id || '');
    
    // Reset scores
    setConfig(prev => ({
      ...prev,
      teams: prev.teams.map(t => ({ ...t, score: 0 }))
    }));
    
    setStatus('playing');
  };

  const handleCorrectAnswer = () => {
    if (!answeringTeamId) {
      alert('Vui lòng chọn đội trả lời!');
      return;
    }

    // Add points
    setConfig(prev => ({
      ...prev,
      teams: prev.teams.map(t => 
        t.id === answeringTeamId ? { ...t, score: t.score + prev.pointsPerQuestion } : t
      )
    }));

    if (config.revealMode === 'random') {
      revealRandomTile();
    }
    
    nextQuestion();
  };

  const handleWrongAnswer = () => {
    nextQuestion();
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < config.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      alert('Đã hết câu hỏi!');
    }
  };

  const revealRandomTile = () => {
    const totalTiles = config.gridSize * config.gridSize;
    const hiddenTiles = Array.from({ length: totalTiles }, (_, i) => i).filter(i => !revealedTiles.includes(i));
    
    if (hiddenTiles.length > 0) {
      const randomIndex = Math.floor(Math.random() * hiddenTiles.length);
      setRevealedTiles(prev => [...prev, hiddenTiles[randomIndex]]);
    }
  };

  const handleTileClick = (index: number) => {
    if (status !== 'playing') return;
    if (config.revealMode === 'manual' && !revealedTiles.includes(index)) {
      setRevealedTiles(prev => [...prev, index]);
    }
  };

  const handleGuessSecret = () => {
    if (!guessingTeamId) {
      alert('Vui lòng chọn đội đoán!');
      return;
    }

    if (!secretGuess.trim()) return;

    // Simplified check: case insensitive, ignore extra spaces
    const isCorrect = secretGuess.trim().toLowerCase() === config.secretKeyword.trim().toLowerCase();

    if (isCorrect || (config.secretType === 'image' && window.confirm(`Đội đã đoán: "${secretGuess}". Đáp án này có đúng với hình ảnh bí mật không?`))) {
      // Correct guess
      setConfig(prev => ({
        ...prev,
        teams: prev.teams.map(t => 
          t.id === guessingTeamId ? { ...t, score: t.score + prev.pointsForSecret } : t
        )
      }));
      
      // Reveal all tiles
      const totalTiles = config.gridSize * config.gridSize;
      setRevealedTiles(Array.from({ length: totalTiles }, (_, i) => i));
      setWinnerTeamId(guessingTeamId);
      setStatus('finished');
    } else {
      alert('Rất tiếc, đáp án chưa chính xác!');
      setSecretGuess('');
    }
  };

  const renderSetup = () => (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-600" />
          Cài đặt trò chơi
        </h2>
        <button 
          onClick={startGame}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md"
        >
          <Play className="w-5 h-5" />
          Bắt đầu chơi
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: General Settings */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">Thông tin chung</h3>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tiêu đề trò chơi</label>
              <input 
                type="text" 
                value={config.title}
                onChange={e => setConfig({...config, title: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Loại bí mật</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={config.secretType === 'image'}
                    onChange={() => setConfig({...config, secretType: 'image'})}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">Hình ảnh</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={config.secretType === 'keyword'}
                    onChange={() => setConfig({...config, secretType: 'keyword'})}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">Từ khóa</span>
                </label>
              </div>
            </div>

            {config.secretType === 'image' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hình ảnh bí mật</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors relative overflow-hidden"
                >
                  {config.secretImage ? (
                    <img src={config.secretImage} alt="Secret" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-slate-400 mb-2" />
                      <span className="text-sm text-slate-500">Tải ảnh lên</span>
                    </>
                  )}
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Từ khóa bí mật</label>
                <input 
                  type="text" 
                  value={config.secretKeyword}
                  onChange={e => setConfig({...config, secretKeyword: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Nhập từ khóa..."
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kích thước lưới</label>
              <select 
                value={config.gridSize}
                onChange={e => setConfig({...config, gridSize: Number(e.target.value) as 3|4|5})}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value={3}>3 x 3 (9 ô)</option>
                <option value={4}>4 x 4 (16 ô)</option>
                <option value={5}>5 x 5 (25 ô)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cách mở ô</label>
              <select 
                value={config.revealMode}
                onChange={e => setConfig({...config, revealMode: e.target.value as 'random'|'manual'})}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="random">Ngẫu nhiên khi trả lời đúng</option>
                <option value="manual">Giáo viên tự chọn ô</option>
              </select>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">Điểm số & Đội chơi</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Điểm/câu đúng</label>
                <input 
                  type="number" 
                  value={config.pointsPerQuestion}
                  onChange={e => setConfig({...config, pointsPerQuestion: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Điểm đoán bí mật</label>
                <input 
                  type="number" 
                  value={config.pointsForSecret}
                  onChange={e => setConfig({...config, pointsForSecret: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">Danh sách đội</label>
                <button 
                  onClick={() => setConfig({
                    ...config, 
                    teams: [...config.teams, { id: Math.random().toString(), name: `Đội ${config.teams.length + 1}`, score: 0 }]
                  })}
                  className="text-xs text-indigo-600 font-medium hover:text-indigo-800 flex items-center"
                >
                  <Plus className="w-3 h-3 mr-1" /> Thêm đội
                </button>
              </div>
              <div className="space-y-2">
                {config.teams.map((team, idx) => (
                  <div key={team.id} className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={team.name}
                      onChange={e => {
                        const newTeams = [...config.teams];
                        newTeams[idx].name = e.target.value;
                        setConfig({...config, teams: newTeams});
                      }}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    />
                    <button 
                      onClick={() => {
                        if (config.teams.length > 1) {
                          setConfig({...config, teams: config.teams.filter(t => t.id !== team.id)});
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Questions */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Type className="w-5 h-5 text-indigo-600" />
                Danh sách câu hỏi ({config.questions.length})
              </h3>
              <button 
                onClick={() => setConfig({
                  ...config,
                  questions: [...config.questions, { id: Math.random().toString(), text: '', answer: '' }]
                })}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
              >
                <Plus className="w-4 h-4" /> Thêm câu hỏi
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {config.questions.map((q, idx) => (
                <div key={q.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative group">
                  <button 
                    onClick={() => {
                      if (config.questions.length > 1) {
                        setConfig({...config, questions: config.questions.filter(question => question.id !== q.id)});
                      }
                    }}
                    className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <input 
                          type="text" 
                          value={q.text}
                          onChange={e => {
                            const newQs = [...config.questions];
                            newQs[idx].text = e.target.value;
                            setConfig({...config, questions: newQs});
                          }}
                          placeholder="Nhập nội dung câu hỏi..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        />
                      </div>
                      <div>
                        <input 
                          type="text" 
                          value={q.answer}
                          onChange={e => {
                            const newQs = [...config.questions];
                            newQs[idx].answer = e.target.value;
                            setConfig({...config, questions: newQs});
                          }}
                          placeholder="Nhập đáp án..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-emerald-700"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPlaying = () => {
    const totalTiles = config.gridSize * config.gridSize;
    const currentQuestion = config.questions[currentQuestionIndex];

    return (
      <div className="h-full flex flex-col bg-slate-900 text-white p-4 md:p-8 overflow-hidden relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 shrink-0">
          <h2 className="text-2xl md:text-3xl font-bold text-white drop-shadow-md">{config.title}</h2>
          <button 
            onClick={() => setStatus('setup')}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm transition-colors font-medium flex items-center gap-2"
          >
            <Settings className="w-4 h-4" /> Cài đặt
          </button>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
          {/* Left: Grid */}
          <div className="flex-1 flex items-center justify-center min-h-0">
            <div 
              className="relative aspect-square max-h-full w-full max-w-[600px] bg-slate-800 rounded-xl overflow-hidden shadow-2xl border-4 border-slate-700"
            >
              {/* Secret Content Behind */}
              <div className="absolute inset-0 flex items-center justify-center p-4">
                {config.secretType === 'image' && config.secretImage ? (
                  <img src={config.secretImage} alt="Secret" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-4xl md:text-6xl font-black text-indigo-400 text-center uppercase tracking-widest break-words w-full">
                    {config.secretKeyword}
                  </div>
                )}
              </div>

              {/* Grid Overlay */}
              <div 
                className="absolute inset-0 grid gap-1 p-1 bg-slate-800"
                style={{ 
                  gridTemplateColumns: `repeat(${config.gridSize}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${config.gridSize}, minmax(0, 1fr))`
                }}
              >
                {Array.from({ length: totalTiles }).map((_, idx) => {
                  const isRevealed = revealedTiles.includes(idx);
                  return (
                    <div 
                      key={idx}
                      onClick={() => handleTileClick(idx)}
                      className={`relative w-full h-full transition-all duration-700 transform perspective-1000 ${config.revealMode === 'manual' && !isRevealed ? 'cursor-pointer hover:scale-[0.98]' : ''}`}
                      style={{ transformStyle: 'preserve-3d' }}
                    >
                      <div 
                        className="w-full h-full absolute inset-0 transition-transform duration-700"
                        style={{ 
                          transformStyle: 'preserve-3d',
                          transform: isRevealed ? 'rotateY(180deg)' : 'rotateY(0deg)'
                        }}
                      >
                        {/* Front (Cover) */}
                        <div 
                          className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded shadow-inner flex items-center justify-center border border-indigo-400/30 backface-hidden"
                          style={{ backfaceVisibility: 'hidden' }}
                        >
                          <span className="text-2xl md:text-4xl font-bold text-white/50">{idx + 1}</span>
                        </div>
                        {/* Back (Transparent to show secret) */}
                        <div 
                          className="absolute inset-0 bg-transparent backface-hidden"
                          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Controls & Score */}
          <div className="w-full lg:w-96 flex flex-col gap-6 shrink-0 overflow-y-auto pr-2">
            
            {/* Current Question */}
            {status === 'playing' && currentQuestion && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3 py-1 bg-indigo-500 text-white text-sm font-bold rounded-full">
                    Câu {currentQuestionIndex + 1} / {config.questions.length}
                  </span>
                  <button 
                    onClick={nextQuestion}
                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title="Bỏ qua câu hỏi"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                </div>
                
                <p className="text-lg md:text-xl font-medium text-white mb-6 leading-relaxed">
                  {currentQuestion.text}
                </p>

                <div className="space-y-4">
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <p className="text-sm text-slate-400 mb-1">Đáp án:</p>
                    <p className="font-bold text-emerald-400 text-lg">{currentQuestion.answer}</p>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-300 mb-2">Đội trả lời:</label>
                    <select 
                      value={answeringTeamId}
                      onChange={e => setAnsweringTeamId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 outline-none mb-3"
                    >
                      {config.teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={handleCorrectAnswer}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold transition-colors"
                      >
                        <CheckCircle className="w-5 h-5" /> Đúng
                      </button>
                      <button 
                        onClick={handleWrongAnswer}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold transition-colors"
                      >
                        <XCircle className="w-5 h-5" /> Sai
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Guess Secret */}
            {status === 'playing' && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-yellow-400" />
                  Đoán ô bí mật
                </h3>
                <div className="space-y-3">
                  <select 
                    value={guessingTeamId}
                    onChange={e => setGuessingTeamId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {config.teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <input 
                    type="text" 
                    value={secretGuess}
                    onChange={e => setSecretGuess(e.target.value)}
                    placeholder="Nhập đáp án đoán..."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                  />
                  <button 
                    onClick={handleGuessSecret}
                    className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-600 text-slate-900 rounded-lg font-bold transition-colors"
                  >
                    Xác nhận đoán
                  </button>
                </div>
              </div>
            )}

            {/* Scoreboard */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl flex-1">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Bảng điểm
              </h3>
              <div className="space-y-3">
                {config.teams.sort((a,b) => b.score - a.score).map((team, idx) => (
                  <div key={team.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 && team.score > 0 ? 'bg-yellow-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>
                        {idx + 1}
                      </span>
                      <span className="font-medium text-white">{team.name}</span>
                    </div>
                    <span className="font-bold text-xl text-indigo-400">{team.score}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Winner Overlay */}
        {status === 'finished' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center transform animate-bounce-in">
              <div className="w-24 h-24 bg-yellow-100 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trophy className="w-12 h-12" />
              </div>
              <h2 className="text-3xl font-black text-slate-800 mb-2">Chúc mừng!</h2>
              <p className="text-lg text-slate-600 mb-6">
                Đội <span className="font-bold text-indigo-600">{config.teams.find(t => t.id === winnerTeamId)?.name}</span> đã đoán chính xác ô bí mật!
              </p>
              
              <div className="bg-slate-50 p-4 rounded-xl mb-8">
                <p className="text-sm text-slate-500 mb-1">Đáp án bí mật:</p>
                <p className="font-bold text-xl text-emerald-600">{config.secretKeyword}</p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setStatus('setup')}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cài đặt lại
                </button>
                <button 
                  onClick={startGame}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors"
                >
                  Chơi lại
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col">
      {status === 'setup' ? (
        <>
          <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center gap-4 shrink-0">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Gift className="w-6 h-6 text-yellow-600" />
              Mở ô bí mật
            </h1>
          </header>
          <div className="flex-1 overflow-auto">
            {renderSetup()}
          </div>
        </>
      ) : (
        renderPlaying()
      )}
    </div>
  );
}
