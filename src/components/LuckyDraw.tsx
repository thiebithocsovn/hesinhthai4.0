import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Users, Play, Camera, Maximize, Minimize, Trash2, Check } from 'lucide-react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

interface LuckyDrawProps {
  onBack: () => void;
  initialMode?: 'wheel' | 'cards';
}

const colors = [
  '#FF595E', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93',
  '#FF924C', '#52A675', '#3E5C76', '#E07A5F', '#F2CC8F'
];

export default function LuckyDraw({ onBack, initialMode = 'wheel' }: LuckyDrawProps) {
  const [studentsInput, setStudentsInput] = useState('');
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const studentsRef = useRef<{ id: string; name: string }[]>([]);
  
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<{id: string, name: string} | null>(null);
  const [showWinnerModal, setShowWinnerModal] = useState(false);

  const [drawMode, setDrawMode] = useState<'wheel' | 'cards'>(initialMode);
  const drawModeRef = useRef(drawMode);
  const [drawingCardIndex, setDrawingCardIndex] = useState<number | null>(null);
  const [revealedCard, setRevealedCard] = useState<{index: number, student: any} | null>(null);

  const isSpinningRef = useRef(false);
  const showWinnerModalRef = useRef(false);

  useEffect(() => {
    studentsRef.current = students;
    isSpinningRef.current = isSpinning;
    showWinnerModalRef.current = showWinnerModal;
    drawModeRef.current = drawMode;
  }, [students, isSpinning, showWinnerModal, drawMode]);
  
  // Camera & Gesture State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [gestureRecognizer, setGestureRecognizer] = useState<GestureRecognizer | null>(null);
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);

  useEffect(() => {
    gestureRecognizerRef.current = gestureRecognizer;
  }, [gestureRecognizer]);
  
  const [cameraError, setCameraError] = useState('');
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  useEffect(() => {
    async function initGestureRecognizer() {
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
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO"
        });
        
        // Restore console methods
        console.info = originalConsoleInfo;
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;
        
        setGestureRecognizer(recognizer);
      } catch (error) {
        console.error("Error initializing gesture recognizer:", error);
      }
    }
    initGestureRecognizer();
  }, []);

  const isCameraActiveRef = useRef(false);
  const gestureOutputRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const smoothedPosRef = useRef({ x: -1, y: -1 });

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        isCameraActiveRef.current = true;
        setIsCameraActive(true);
        setCameraError('');
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setCameraError('Không thể truy cập máy ảnh. Vui lòng kiểm tra quyền truy cập.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    isCameraActiveRef.current = false;
    setIsCameraActive(false);
    smoothedPosRef.current = { x: -1, y: -1 };
  };

  useEffect(() => {
    isCameraActiveRef.current = isCameraActive;
  }, [isCameraActive]);

  const [shuffledStudents, setShuffledStudents] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    // Shuffle students when switching to cards mode or when students list changes
    if (drawMode === 'cards') {
      const shuffled = [...students].sort(() => Math.random() - 0.5);
      setShuffledStudents(shuffled);
    }
  }, [students, drawMode]);

  const handleSpin = (forcedWinnerIndex?: number) => {
    if (isSpinningRef.current || studentsRef.current.length === 0 || showWinnerModalRef.current) return;
    
    const currentStudents = studentsRef.current;
    
    setIsSpinning(true);

    if (drawModeRef.current === 'wheel') {
      const winnerIndex = forcedWinnerIndex !== undefined ? forcedWinnerIndex : Math.floor(Math.random() * currentStudents.length);
      const selectedWinner = currentStudents[winnerIndex];
      
      const sliceAngle = 360 / currentStudents.length;
      const targetRot = 270 - (winnerIndex + 0.5) * sliceAngle;
      
      setRotation(prevRot => {
        const currentRotMod = prevRot % 360;
        let diff = targetRot - currentRotMod;
        while (diff < 0) diff += 360;
        return prevRot + diff + 360 * 5; // Spin 5 times
      });
      
      setTimeout(() => {
        setIsSpinning(false);
        setWinner(selectedWinner);
        setShowWinnerModal(true);
      }, 5000);
    } else {
      // Cards mode
      const winnerIndex = forcedWinnerIndex !== undefined ? forcedWinnerIndex : Math.floor(Math.random() * currentStudents.length);
      // In cards mode, the winner is the student at the winnerIndex in the shuffled array
      const selectedWinner = shuffledStudents[winnerIndex] || currentStudents[winnerIndex];
      
      let jumps = 0;
      const maxJumps = forcedWinnerIndex !== undefined ? 0 : 15;
      
      if (maxJumps > 0) {
        const interval = setInterval(() => {
          setDrawingCardIndex(Math.floor(Math.random() * currentStudents.length));
          jumps++;
          if (jumps >= maxJumps) {
            clearInterval(interval);
            setDrawingCardIndex(winnerIndex);
            setRevealedCard({ index: winnerIndex, student: selectedWinner });
            
            setTimeout(() => {
              setIsSpinning(false);
              setWinner(selectedWinner);
              setShowWinnerModal(true);
              setDrawingCardIndex(null);
              setRevealedCard(null);
            }, 1500);
          }
        }, 100);
      } else {
        setDrawingCardIndex(winnerIndex);
        setRevealedCard({ index: winnerIndex, student: selectedWinner });
        setTimeout(() => {
          setIsSpinning(false);
          setWinner(selectedWinner);
          setShowWinnerModal(true);
          setDrawingCardIndex(null);
          setRevealedCard(null);
        }, 1500);
      }
    }
  };

  const handleSpinRef = useRef(handleSpin);
  useEffect(() => {
    handleSpinRef.current = handleSpin;
  });

  const predictWebcam = async () => {
    if (!videoRef.current) return;

    if (gestureRecognizerRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      let startTimeMs = performance.now();
      if (lastVideoTimeRef.current !== videoRef.current.currentTime) {
        lastVideoTimeRef.current = videoRef.current.currentTime;
        try {
          const results = gestureRecognizerRef.current.recognizeForVideo(videoRef.current, startTimeMs);
          
          if (results.landmarks && results.landmarks.length > 0) {
            const hand = results.landmarks[0];
            const indexFingerTip = hand[8]; // Index finger tip
            
            let isFist = false;
            if (results.gestures.length > 0) {
              const categoryName = results.gestures[0][0].categoryName;
              const categoryScore = parseFloat((results.gestures[0][0].score * 100).toFixed(2));
              
              if (gestureOutputRef.current) {
                gestureOutputRef.current.innerText = `Cử chỉ: ${categoryName} (${categoryScore}%)`;
              }
              
              if (categoryName === "Closed_Fist" && categoryScore > 60) {
                isFist = true;
              }
            }

            if (cursorRef.current && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              // The camera is mirrored, so x is 1 - x
              const targetX = (1 - indexFingerTip.x) * rect.width;
              const targetY = indexFingerTip.y * rect.height;
              
              // Smooth the cursor movement
              const smoothing = 0.35; // Balance between responsiveness and smoothness
              
              if (smoothedPosRef.current.x === -1 && smoothedPosRef.current.y === -1) {
                smoothedPosRef.current.x = targetX;
                smoothedPosRef.current.y = targetY;
              } else {
                smoothedPosRef.current.x += (targetX - smoothedPosRef.current.x) * smoothing;
                smoothedPosRef.current.y += (targetY - smoothedPosRef.current.y) * smoothing;
              }
              
              const x = smoothedPosRef.current.x;
              const y = smoothedPosRef.current.y;
              
              cursorRef.current.style.transform = `translate(${x}px, ${y}px)`;
              cursorRef.current.style.display = 'block';
              
              const clientX = rect.left + x;
              const clientY = rect.top + y;
              
              const el = document.elementFromPoint(clientX, clientY);
              const cardEl = el?.closest('[data-card-index]');
              
              if (drawModeRef.current === 'wheel') {
                if (isFist && !isSpinningRef.current && !showWinnerModalRef.current) {
                  handleSpinRef.current();
                }
              } else if (cardEl) {
                const index = parseInt(cardEl.getAttribute('data-card-index') || '-1', 10);
                if (index >= 0) {
                  // Hover effect can be handled by CSS if needed, but we just need to click
                  if (isFist) {
                    if (!isSpinningRef.current && !showWinnerModalRef.current) {
                      handleSpinRef.current(index);
                    }
                  }
                }
              }
            }
          } else {
            if (gestureOutputRef.current) {
              gestureOutputRef.current.innerText = 'Không nhận diện được tay';
            }
            if (cursorRef.current) {
              cursorRef.current.style.display = 'none';
            }
            smoothedPosRef.current = { x: -1, y: -1 };
          }
        } catch (e) {
          console.error("Error recognizing gesture:", e);
        }
      }
    }
    
    if (isCameraActiveRef.current) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  };

  useEffect(() => {
    if (isCameraActive) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isCameraActive, gestureRecognizer]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleImportStudents = () => {
    if (!studentsInput.trim()) return;
    const lines = studentsInput.split('\n').filter(line => line.trim() !== '');
    const newStudents = lines.map(line => {
      const parts = line.split('\t');
      const name = parts.length > 1 ? parts[1].trim() : parts[0].trim();
      return {
        id: Math.random().toString(36).substr(2, 9),
        name
      };
    });
    setStudents(newStudents);
    setRotation(0);
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Canvas Drawing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const radius = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (students.length === 0) {
      ctx.beginPath();
      ctx.arc(radius, radius, radius - 10, 0, 2 * Math.PI);
      ctx.fillStyle = '#f1f5f9';
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '16px Inter';
      ctx.fillText('Chưa có học sinh', radius, radius);
      return;
    }

    const arc = (2 * Math.PI) / students.length;

    students.forEach((student, i) => {
      const angle = i * arc;
      ctx.beginPath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.moveTo(radius, radius);
      ctx.arc(radius, radius, radius - 10, angle, angle + arc);
      ctx.lineTo(radius, radius);
      ctx.fill();
      
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.save();
      ctx.translate(radius, radius);
      ctx.rotate(angle + arc / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px Inter";
      const text = student.name.length > 15 ? student.name.substring(0, 15) + '...' : student.name;
      ctx.fillText(text, radius - 30, 0);
      ctx.restore();
    });
    
    // Draw center circle
    ctx.beginPath();
    ctx.arc(radius, radius, 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#334155';
    ctx.stroke();
    
  }, [students]);

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-slate-50 relative">
      {/* Hand Cursor */}
      <div 
        ref={cursorRef}
        className="absolute w-8 h-8 bg-indigo-500/50 rounded-full border-2 border-indigo-600 pointer-events-none z-50 hidden"
        style={{ top: -16, left: -16 }}
      />
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-2xl font-bold text-slate-800">
            {drawMode === 'wheel' ? 'Vòng quay may mắn' : 'Bốc thẻ'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            {isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
          </button>
          <button
            onClick={isCameraActive ? stopCamera : startCamera}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isCameraActive 
                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            }`}
          >
            <Camera className="w-4 h-4" />
            {isCameraActive ? 'Tắt Camera (Cử chỉ)' : 'Bật Camera (Cử chỉ nắm tay)'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8 flex gap-8">
        {/* Left Sidebar - Input */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Danh sách học sinh
            </h2>

            <textarea
              value={studentsInput}
              onChange={(e) => setStudentsInput(e.target.value)}
              className="w-full h-48 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none text-sm mb-3"
              placeholder="Dán danh sách từ Excel vào đây (mỗi dòng 1 tên)..."
            />
            <button
              onClick={handleImportStudents}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Cập nhật danh sách
            </button>
          </div>

          <div className={`bg-white p-4 rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative ${!isCameraActive ? 'hidden' : ''}`}>
            <h3 className="text-sm font-bold text-slate-700 mb-2">Camera nhận diện cử chỉ</h3>
            <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative mb-2">
              <video 
                ref={videoRef} 
                className="w-full h-full object-cover -scale-x-100"
                autoPlay 
                playsInline
              />
              <div className="absolute bottom-2 left-0 right-0 text-center text-white text-xs font-medium drop-shadow-md">
                Nắm tay lại để quay vòng
              </div>
            </div>
            <div ref={gestureOutputRef} className="text-xs text-indigo-600 font-medium text-center h-4">
              Đang khởi động...
            </div>
            {cameraError && <p className="text-xs text-red-500 mt-2">{cameraError}</p>}
          </div>
        </div>

        {/* Right Area - Game Board */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-8 left-8 text-slate-600 z-10">
            Tổng số: <span className="font-bold text-slate-900">{students.length}</span> học sinh
          </div>

          {drawMode === 'wheel' ? (
            <div className="relative flex items-center justify-center w-[500px] h-[500px]">
              {/* Pointer */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10">
                <div className="w-0 h-0 border-l-[15px] border-r-[15px] border-t-[30px] border-l-transparent border-r-transparent border-t-slate-800 drop-shadow-md"></div>
              </div>
              
              {/* Wheel */}
              <canvas 
                ref={canvasRef}
                width={500}
                height={500}
                className="transition-transform"
                style={{ 
                  transform: `rotate(${rotation}deg)`, 
                  transitionDuration: isSpinning ? '5s' : '0s',
                  transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)'
                }}
              />
              
              {/* Spin Button (Center) */}
              <button
                onClick={() => handleSpin()}
                disabled={isSpinning || students.length === 0}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-50 disabled:hover:scale-100 z-10"
              >
                <Play className="w-6 h-6 text-indigo-600 ml-1" />
              </button>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center">
              <div className="flex-1 w-full overflow-y-auto p-4 flex flex-wrap content-start justify-center gap-4">
                {students.map((student, index) => {
                  const isDrawing = drawingCardIndex === index;
                  const isRevealed = revealedCard?.index === index;
                  
                  return (
                    <div 
                      key={student.id} 
                      data-card-index={index}
                      onClick={() => !isSpinning && handleSpin(index)}
                      className={`relative w-24 h-32 rounded-xl shadow-md cursor-pointer transition-all duration-300 transform perspective-1000
                        ${isDrawing ? 'scale-110 ring-4 ring-indigo-400 z-10' : 'hover:-translate-y-2'}
                        ${isSpinning && !isDrawing && !isRevealed ? 'opacity-50' : 'opacity-100'}
                      `}
                      style={{ transformStyle: 'preserve-3d' }}
                    >
                      {/* Card Inner */}
                      <div 
                        className="w-full h-full relative transition-transform duration-500"
                        style={{ 
                          transformStyle: 'preserve-3d',
                          transform: isRevealed ? 'rotateY(180deg)' : 'rotateY(0deg)'
                        }}
                      >
                        {/* Front (Face Down) */}
                        <div 
                          className="absolute inset-0 w-full h-full bg-indigo-500 rounded-xl border-2 border-white flex items-center justify-center backface-hidden"
                          style={{ backfaceVisibility: 'hidden' }}
                        >
                          <div className="w-16 h-24 border-2 border-indigo-300 rounded-lg opacity-50 flex items-center justify-center">
                            <div className="w-8 h-8 bg-indigo-300 rounded-full opacity-50"></div>
                          </div>
                        </div>
                        
                        {/* Back (Face Up) */}
                        <div 
                          className="absolute inset-0 w-full h-full bg-white rounded-xl border-2 border-indigo-500 flex items-center justify-center p-2 backface-hidden"
                          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                        >
                          <span className="text-center font-bold text-indigo-700 text-sm break-words">
                            {isRevealed ? revealedCard.student.name : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {students.length === 0 && (
                  <div className="text-slate-400 flex flex-col items-center justify-center h-full w-full">
                    <Users className="w-12 h-12 mb-2 opacity-20" />
                    <p>Chưa có học sinh</p>
                  </div>
                )}
              </div>
              
              <button
                onClick={() => handleSpin()}
                disabled={isSpinning || students.length === 0}
                className="mt-6 px-8 py-3 bg-indigo-600 text-white rounded-xl shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-50 font-bold text-lg"
              >
                Bốc ngẫu nhiên
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Winner Modal */}
      {showWinnerModal && winner && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center transform animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-bold text-slate-800 mb-2">Chúc mừng!</h2>
            <p className="text-2xl text-indigo-600 font-bold mb-8">{winner.name}</p>
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setStudents(students.filter(s => s.id !== winner.id));
                  setShowWinnerModal(false);
                }}
                className="flex-1 py-3 px-4 bg-red-100 text-red-700 hover:bg-red-200 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-5 h-5" />
                Xóa khỏi vòng
              </button>
              <button
                onClick={() => {
                  setShowWinnerModal(false);
                }}
                className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                Giữ lại
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mirror {
          transform: scaleX(-1);
        }
      `}</style>
    </div>
  );
}
