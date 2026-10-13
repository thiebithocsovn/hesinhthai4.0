import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Upload, Plus, Trash2, Play, Settings, Image as ImageIcon, CheckCircle, XCircle, Clock, Target, Move, RefreshCw, Eye } from 'lucide-react';
import { motion, useAnimation, PanInfo } from 'motion/react';
import { auth } from '../firebase';
import { createTeacherStorageKey } from '../lib/teacherIsolation';

interface Label {
  id: string;
  text: string;
  targetX: number | null; // percentage 0-100
  targetY: number | null; // percentage 0-100
}

interface GameConfig {
  title: string;
  backgroundImage: string | null;
  labels: Label[];
  mode: 'auto-lock' | 'mark-end';
  pointsPerLabel: number;
  maxTries: number;
  hasTimer: boolean;
  timeLimit: number; // seconds
}

interface DragDropGameProps {
  onBack: () => void;
}

const DEFAULT_CONFIG: GameConfig = {
  title: 'Bản đồ Việt Nam',
  backgroundImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Vietnam_location_map.svg/500px-Vietnam_location_map.svg.png',
  labels: [
    { id: '1', text: 'Hà Nội', targetX: 45, targetY: 20 },
    { id: '2', text: 'Đà Nẵng', targetX: 65, targetY: 55 },
    { id: '3', text: 'TP. Hồ Chí Minh', targetX: 45, targetY: 80 },
  ],
  mode: 'auto-lock',
  pointsPerLabel: 10,
  maxTries: 3,
  hasTimer: false,
  timeLimit: 60,
};

export default function DragDropGame({ onBack }: DragDropGameProps) {
  const configStorageKey = createTeacherStorageKey('dragDropConfig', auth.currentUser?.uid);
  const [status, setStatus] = useState<'setup' | 'playing' | 'finished'>('setup');
  const [config, setConfig] = useState<GameConfig>(() => {
    const saved = localStorage.getItem(configStorageKey);
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });

  const [activeLabelId, setActiveLabelId] = useState<string | null>(null); // For setting target in setup
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Playing state
  const [placedLabels, setPlacedLabels] = useState<Record<string, { x: number, y: number }>>({});
  const [lockedLabels, setLockedLabels] = useState<string[]>([]);
  const [tries, setTries] = useState(0);
  const [timeLeft, setTimeLeft] = useState(config.timeLimit);
  const [score, setScore] = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);

  useEffect(() => {
    localStorage.setItem(configStorageKey, JSON.stringify(config));
  }, [config, configStorageKey]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'playing' && config.hasTimer && timeLeft > 0 && !showAnswers) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleFinishGame();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status, config.hasTimer, timeLeft, showAnswers]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setConfig({ ...config, backgroundImage: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (status === 'setup' && activeLabelId && imageContainerRef.current) {
      const rect = imageContainerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      setConfig(prev => ({
        ...prev,
        labels: prev.labels.map(l => 
          l.id === activeLabelId ? { ...l, targetX: x, targetY: y } : l
        )
      }));
      setActiveLabelId(null);
    }
  };

  const startGame = () => {
    if (!config.backgroundImage) {
      alert('Vui lòng tải lên ảnh nền!');
      return;
    }
    if (config.labels.length === 0) {
      alert('Vui lòng tạo ít nhất một nhãn!');
      return;
    }

    setPlacedLabels({});
    setLockedLabels([]);
    setTries(0);
    setScore(0);
    setTimeLeft(config.timeLimit);
    setShowAnswers(false);
    setStatus('playing');
  };

  const handleFinishGame = () => {
    let finalScore = 0;
    const newLocked: string[] = [];
    
    config.labels.forEach(label => {
      const placed = placedLabels[label.id];
      if (placed && label.targetX !== null && label.targetY !== null) {
        const dx = placed.x - label.targetX;
        const dy = placed.y - label.targetY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 5) { // 5% tolerance
          finalScore += config.pointsPerLabel;
          newLocked.push(label.id);
        }
      }
    });

    setScore(finalScore);
    setLockedLabels(newLocked);
    setStatus('finished');
  };

  const checkDrop = (labelId: string, info: PanInfo) => {
    if (status !== 'playing' || showAnswers) return false;
    
    const label = config.labels.find(l => l.id === labelId);
    if (!label || label.targetX === null || label.targetY === null) return false;

    if (!imageContainerRef.current) return false;
    
    const rect = imageContainerRef.current.getBoundingClientRect();
    
    // Calculate drop position relative to image container in percentage
    const dropX = ((info.point.x - rect.left) / rect.width) * 100;
    const dropY = ((info.point.y - rect.top) / rect.height) * 100;

    const dx = dropX - label.targetX;
    const dy = dropY - label.targetY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Tolerance radius (e.g., 5% of image size)
    const isCorrect = distance < 8;

    if (config.mode === 'auto-lock') {
      if (isCorrect) {
        setPlacedLabels(prev => ({ ...prev, [labelId]: { x: label.targetX!, y: label.targetY! } }));
        setLockedLabels(prev => [...prev, labelId]);
        setScore(prev => prev + config.pointsPerLabel);
        
        if (lockedLabels.length + 1 === config.labels.length) {
          setTimeout(() => setStatus('finished'), 500);
        }
        return true; // Snap to target
      } else {
        setTries(prev => prev + 1);
        if (config.maxTries > 0 && tries + 1 >= config.maxTries) {
          alert('Bạn đã hết số lần thử!');
          handleFinishGame();
        }
        return false; // Snap back
      }
    } else {
      // Mark-end mode: just place it where dropped
      if (dropX >= 0 && dropX <= 100 && dropY >= 0 && dropY <= 100) {
        setPlacedLabels(prev => ({ ...prev, [labelId]: { x: dropX, y: dropY } }));
        return true; // Stay where dropped
      }
      return false; // Snap back if dropped outside
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const renderSetup = () => (
    <div className="flex-1 flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center gap-4 shrink-0">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Move className="w-6 h-6 text-cyan-600" />
          Kéo thả đúng chỗ
        </h1>
      </header>
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Settings className="w-6 h-6 text-cyan-600" />
              Cài đặt trò chơi
            </h2>
            <button 
              onClick={startGame}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition-colors shadow-md"
            >
              <Play className="w-5 h-5" />
              Bắt đầu chơi
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Settings & Labels */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">Thông tin chung</h3>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tiêu đề trò chơi</label>
              <input 
                type="text" 
                value={config.title}
                onChange={e => setConfig({...config, title: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Chế độ chấm điểm</label>
              <select 
                value={config.mode}
                onChange={e => setConfig({...config, mode: e.target.value as 'auto-lock'|'mark-end'})}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
              >
                <option value="auto-lock">Tự động khóa nhãn đúng</option>
                <option value="mark-end">Chỉ chấm điểm khi nộp bài</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Điểm/nhãn đúng</label>
                <input 
                  type="number" 
                  value={config.pointsPerLabel}
                  onChange={e => setConfig({...config, pointsPerLabel: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Số lần thử (0 = vô hạn)</label>
                <input 
                  type="number" 
                  value={config.maxTries}
                  onChange={e => setConfig({...config, maxTries: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={config.hasTimer}
                  onChange={e => setConfig({...config, hasTimer: e.target.checked})}
                  className="rounded text-cyan-600 focus:ring-cyan-500"
                />
                Tính thời gian
              </label>
              {config.hasTimer && (
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    value={config.timeLimit}
                    onChange={e => setConfig({...config, timeLimit: Number(e.target.value)})}
                    className="w-16 px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-cyan-500 outline-none text-right"
                  />
                  <span className="text-sm text-slate-500">giây</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-800 text-lg">Danh sách nhãn</h3>
              <button 
                onClick={() => setConfig({
                  ...config, 
                  labels: [...config.labels, { id: Math.random().toString(), text: 'Nhãn mới', targetX: null, targetY: null }]
                })}
                className="text-xs text-cyan-600 font-medium hover:text-cyan-800 flex items-center"
              >
                <Plus className="w-3 h-3 mr-1" /> Thêm nhãn
              </button>
            </div>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {config.labels.map((label, idx) => (
                <div key={label.id} className={`p-3 rounded-xl border ${activeLabelId === label.id ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <input 
                      type="text" 
                      value={label.text}
                      onChange={e => {
                        const newLabels = [...config.labels];
                        newLabels[idx].text = e.target.value;
                        setConfig({...config, labels: newLabels});
                      }}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-sm bg-white"
                      placeholder="Tên nhãn..."
                    />
                    <button 
                      onClick={() => {
                        setConfig({...config, labels: config.labels.filter(l => l.id !== label.id)});
                        if (activeLabelId === label.id) setActiveLabelId(null);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {label.targetX !== null ? `Đã đặt vị trí` : 'Chưa đặt vị trí'}
                    </span>
                    <button 
                      onClick={() => setActiveLabelId(activeLabelId === label.id ? null : label.id)}
                      className={`text-xs px-2 py-1 rounded font-medium transition-colors ${activeLabelId === label.id ? 'bg-cyan-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                    >
                      {activeLabelId === label.id ? 'Đang chọn điểm...' : 'Đặt vị trí'}
                    </button>
                  </div>
                </div>
              ))}
              {config.labels.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">Chưa có nhãn nào.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Image Preview & Target Setting */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-cyan-600" />
                Ảnh nền & Vị trí đích
              </h3>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                <Upload className="w-4 h-4" /> Tải ảnh lên
              </button>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
            </div>

            <div className="flex-1 bg-slate-100 rounded-xl overflow-hidden relative flex items-center justify-center border-2 border-dashed border-slate-300">
              {config.backgroundImage ? (
                <div 
                  ref={imageContainerRef}
                  onClick={handleImageClick}
                  className={`relative w-full h-full flex items-center justify-center ${activeLabelId ? 'cursor-crosshair' : ''}`}
                >
                  <img 
                    src={config.backgroundImage} 
                    alt="Background" 
                    className="max-w-full max-h-[600px] object-contain pointer-events-none" 
                  />
                  
                  {/* Render Targets */}
                  {config.labels.map(label => {
                    if (label.targetX === null || label.targetY === null) return null;
                    const isActive = activeLabelId === label.id;
                    return (
                      <div 
                        key={`target-${label.id}`}
                        className={`absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 flex items-center justify-center shadow-sm z-10 ${isActive ? 'bg-cyan-500 border-white animate-pulse' : 'bg-white border-cyan-500'}`}
                        style={{ left: `${label.targetX}%`, top: `${label.targetY}%` }}
                        title={label.text}
                      >
                        <Target className={`w-3 h-3 ${isActive ? 'text-white' : 'text-cyan-500'}`} />
                        <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/80 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                          {label.text}
                        </span>
                      </div>
                    );
                  })}

                  {activeLabelId && (
                    <div className="absolute inset-0 bg-cyan-500/10 pointer-events-none flex items-center justify-center">
                      <span className="bg-slate-900/80 text-white px-4 py-2 rounded-lg font-medium shadow-lg">
                        Click vào ảnh để đặt vị trí cho nhãn đang chọn
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-slate-400">
                  <ImageIcon className="w-16 h-16 mx-auto mb-2 opacity-50" />
                  <p>Chưa có ảnh nền</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );

  const renderPlaying = () => {
    const totalLabels = config.labels.length;
    const correctCount = lockedLabels.length;

    return (
      <div className="h-full flex flex-col bg-slate-50 relative">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center justify-between shrink-0 shadow-sm z-20">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setStatus('setup')}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">{config.title}</h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
              <CheckCircle className="w-5 h-5 text-indigo-600" />
              <span className="font-bold text-indigo-700">
                {correctCount} / {totalLabels}
              </span>
            </div>
            
            {config.hasTimer && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono font-bold text-lg ${timeLeft < 10 ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                <Clock className="w-5 h-5" />
                {formatTime(timeLeft)}
              </div>
            )}

            {config.mode === 'mark-end' && status === 'playing' && (
              <button 
                onClick={handleFinishGame}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors shadow-sm"
              >
                Nộp bài
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Main Area: Image */}
          <div className="flex-1 p-4 md:p-8 flex items-center justify-center bg-slate-200/50 overflow-hidden relative">
            <div 
              ref={imageContainerRef}
              className="relative max-w-full max-h-full shadow-xl rounded-xl overflow-hidden bg-white"
              style={{ display: 'inline-block' }}
            >
              <img 
                src={config.backgroundImage!} 
                alt="Background" 
                className="max-w-full max-h-[70vh] object-contain pointer-events-none block" 
              />
              
              {/* Drop Zones (Visible in mark-end mode or when showing answers) */}
              {(config.mode === 'mark-end' || showAnswers) && config.labels.map(label => {
                if (label.targetX === null || label.targetY === null) return null;
                return (
                  <div 
                    key={`zone-${label.id}`}
                    className={`absolute w-12 h-12 -ml-6 -mt-6 rounded-full border-2 border-dashed flex items-center justify-center z-0 transition-opacity ${showAnswers ? 'opacity-100 border-emerald-500 bg-emerald-500/20' : 'opacity-30 border-slate-500'}`}
                    style={{ left: `${label.targetX}%`, top: `${label.targetY}%` }}
                  >
                    {showAnswers && (
                      <span className="absolute top-full mt-1 whitespace-nowrap bg-emerald-600 text-white text-xs px-2 py-1 rounded font-medium shadow-sm">
                        {label.text}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Placed Labels (Mark-end mode) */}
              {config.mode === 'mark-end' && config.labels.map(label => {
                const placed = placedLabels[label.id];
                if (!placed) return null;
                const isLocked = lockedLabels.includes(label.id);
                const isFinished = status === 'finished';
                
                return (
                  <div 
                    key={`placed-${label.id}`}
                    className={`absolute px-3 py-1.5 rounded-lg shadow-md font-medium text-sm transform -translate-x-1/2 -translate-y-1/2 z-10 transition-colors ${isFinished ? (isLocked ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white') : 'bg-indigo-600 text-white'}`}
                    style={{ left: `${placed.x}%`, top: `${placed.y}%` }}
                  >
                    {label.text}
                    {isFinished && (
                      <span className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm">
                        {isLocked ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar: Labels to Drag */}
          <div className="w-full lg:w-80 bg-white border-l border-slate-200 p-6 flex flex-col shrink-0 z-30 shadow-[-4px_0_15px_rgba(0,0,0,0.05)]">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Move className="w-5 h-5 text-cyan-600" />
              Kéo nhãn vào ảnh
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {config.labels.map(label => {
                const isLocked = lockedLabels.includes(label.id);
                const isPlaced = !!placedLabels[label.id];
                
                // In mark-end mode, if it's placed, don't show in sidebar
                if (config.mode === 'mark-end' && isPlaced) return null;
                
                // In auto-lock mode, if it's locked, show as disabled
                if (config.mode === 'auto-lock' && isLocked) {
                  return (
                    <div key={`sidebar-${label.id}`} className="px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-medium flex items-center justify-between opacity-60">
                      {label.text}
                      <CheckCircle className="w-5 h-5" />
                    </div>
                  );
                }

                return (
                  <DraggableLabel 
                    key={`drag-${label.id}`} 
                    label={label} 
                    onDrop={(info) => checkDrop(label.id, info)} 
                    disabled={status !== 'playing' || showAnswers}
                  />
                );
              })}
            </div>

            {status === 'finished' && (
              <div className="mt-6 pt-6 border-t border-slate-200 space-y-3">
                <div className="bg-slate-50 p-4 rounded-xl text-center">
                  <p className="text-sm text-slate-500 mb-1">Điểm số của bạn</p>
                  <p className="text-3xl font-black text-indigo-600">{score}</p>
                </div>
                <button 
                  onClick={() => setShowAnswers(!showAnswers)}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <Eye className="w-5 h-5" />
                  {showAnswers ? 'Ẩn đáp án' : 'Xem đáp án'}
                </button>
                <button 
                  onClick={startGame}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-5 h-5" />
                  Chơi lại
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col">
      {status === 'setup' ? renderSetup() : renderPlaying()}
    </div>
  );
}

// Separate component for draggable label to manage its own animation state
function DraggableLabel({ label, onDrop, disabled }: React.Attributes & { label: Label, onDrop: (info: PanInfo) => boolean, disabled: boolean }) {
  const controls = useAnimation();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnd = async (event: any, info: PanInfo) => {
    setIsDragging(false);
    const success = onDrop(info);
    
    if (!success) {
      // Shake and return
      await controls.start({ x: [0, -10, 10, -10, 10, 0], transition: { duration: 0.4 } });
      controls.start({ x: 0, y: 0, transition: { type: 'spring', stiffness: 300, damping: 20 } });
    } else {
      // If auto-lock, it will be unmounted or disabled. If mark-end, it's placed.
      // We reset position for sidebar anyway because placed labels are rendered separately on the image.
      controls.set({ x: 0, y: 0 });
    }
  };

  return (
    <motion.div
      drag={!disabled}
      dragSnapToOrigin={false}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      animate={controls}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileDrag={{ scale: 1.1, zIndex: 50, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}
      className={`px-4 py-3 rounded-xl font-medium shadow-sm border relative z-40 ${disabled ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 cursor-grab active:cursor-grabbing hover:border-cyan-400 hover:shadow-md'}`}
      style={{ touchAction: 'none' }}
    >
      {label.text}
    </motion.div>
  );
}
