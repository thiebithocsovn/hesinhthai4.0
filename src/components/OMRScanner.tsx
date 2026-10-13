import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Send, Image as ImageIcon, CheckCircle, AlertCircle, Loader2, Download } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { postApiJson } from '../lib/api';
import { isValidTeacherUid } from '../lib/teacherIsolation';

interface OMRScannerProps {
  examId: string;
  exams: any[];
  students: any[];
  classes: any[];
  teacherId: string;
  isAdministrator?: boolean;
  onClose: () => void;
}

export default function OMRScanner({ examId, exams, students, classes, teacherId, isAdministrator = false, onClose }: OMRScannerProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allExamResults, setAllExamResults] = useState<any[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const exam = exams.find(e => e.id === examId);
  const examOwnerUid = isValidTeacherUid(exam?.teacherId) ? exam.teacherId : '';

  // Fetch all results for this exam whenever scanner is used or results updated
  useEffect(() => {
    fetchResults();
  }, [examId, examOwnerUid, results, teacherId, isAdministrator]);

  const fetchResults = async () => {
    try {
      if (!examOwnerUid || (!isAdministrator && examOwnerUid !== teacherId)) {
        setAllExamResults([]);
        return;
      }
      const q = query(
        collection(db, 'results'),
        where('examId', '==', examId),
        where('teacherId', '==', examOwnerUid),
      );
      const querySnapshot = await getDocs(q);
      const fetchedResults = querySnapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(result => result.teacherId === examOwnerUid && result.examId === examId);
      setAllExamResults(fetchedResults);
    } catch (err) {
      console.error("Error fetching results:", err);
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsCameraOpen(true);
      setError(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Không thể truy cập camera. Vui lòng cấp quyền (Sử dụng trình duyệt hiện đại trên điện thoại).");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Use higher resolution for better OCR
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // AI handles perspective alignment automatically through the multimodal input
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Add a visual 'flash' or feedback if needed, but for now just capture
        setCapturedImage(canvas.toDataURL('image/jpeg', 0.9));
        stopCamera();
      }
    }
  };

  const processImageWithGemini = async () => {
    if (!capturedImage) return;

    setIsProcessing(true);
    setError(null);

    try {
      const base64Data = capturedImage.split(',')[1];
      
      const prompt = `
        Hãy phân tích ảnh phiếu trả lời trắc nghiệm này. AI sẽ tự động căn chỉnh, xoay và làm phẳng phiếu để đọc chính xác:
        1. Số báo danh (7. Số báo danh): Đọc giá trị được tô ở các cột (6 chữ số).
        2. Mã đề thi (8. Mã đề thi): Đọc giá trị được tô ở các cột (3 chữ số).
        3. PHẦN I: Trả lời câu hỏi trắc nghiệm 4 lựa chọn (40 câu).
        4. PHẦN II: Trả lời Đúng/Sai (8 câu, mỗi câu 4 ý a,b,c,d).
        5. PHẦN III: Trả lời ngắn bằng số (6 câu).

        Yêu cầu trả về JSON chính xác.
      `;

      const data = await postApiJson<any>('scan', { image: base64Data, prompt });
      
      // Grading
      const finalResult = gradeExam(data);
      setResults(finalResult);
    } catch (err) {
      console.error("Error processing image:", err);
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi phân tích ảnh. Vui lòng đảm bảo ảnh chụp đủ sáng và không bị lóa.");
    } finally {
      setIsProcessing(false);
    }
  };

  const gradeExam = (data: any) => {
    if (!exam) return data;

    let score = 0;
    const details = [];
    
    // Grading logic depends on exam structure. 
    // This is a simplified demo grading logic matching the standard 40-question Part I format.
    const part1Answers = data.part1 || {};
    
    // Check Part I
    const numPart1 = Math.min(exam.questions.length, 40);
    for (let i = 0; i < numPart1; i++) {
      const q = exam.questions[i];
      const studentAnswer = part1Answers[i + 1];
      const correctAnswerStr = String.fromCharCode(65 + q.correctAnswer);
      const isCorrect = studentAnswer === correctAnswerStr;
      
      if (isCorrect) score += (q.points || 0.25); // Default 0.25 if not set
      
      details.push({
        question: i + 1,
        studentAnswer,
        correctAnswer: correctAnswerStr,
        isCorrect
      });
    }

    return {
      ...data,
      score: Number(score.toFixed(2)),
      correctCount: details.filter(d => d.isCorrect).length,
      totalCount: numPart1,
      details
    };
  };

  const handleSaveResult = async () => {
    if (!results) return;

    try {
      if (!examOwnerUid || (!isAdministrator && examOwnerUid !== teacherId)) {
        throw new Error('Không thể xác định đúng giáo viên sở hữu kỳ thi.');
      }
      const student = students.find(s =>
        s.code === results.sbd && s.teacherId === examOwnerUid);
      
      await addDoc(collection(db, 'results'), {
        examId: examId,
        studentId: student?.id || 'unknown',
        studentName: student?.name || `SBD: ${results.sbd}`,
        score: results.score,
        totalQuestions: results.totalCount,
        studentSbd: results.sbd,
        examVersion: results.maDe,
        submittedAt: new Date().toISOString(),
        teacherId: examOwnerUid,
        details: results.details,
        type: 'omr_scan'
      });
      
      // Refresh local results for the next export
      fetchResults();
      
      alert("Đã lưu kết quả của học sinh vào hệ thống!");
      setResults(null);
      setCapturedImage(null);
    } catch (err) {
      console.error("Error saving results:", err);
      alert("Lỗi khi lưu kết quả vào cơ sở dữ liệu.");
    }
  };

  const handleExportAllResults = () => {
    if (allExamResults.length === 0) {
      alert("Chưa có kết quả nào để xuất báo cáo.");
      return;
    }
    
    const exportData = allExamResults.map((res: any, index) => ({
      'STT': index + 1,
      'Số báo danh': res.studentSbd || 'N/A',
      'Họ và tên': res.studentName || 'N/A',
      'Mã đề': res.examVersion || '---',
      'Điểm số': res.score,
      'Số câu đúng': `${res.details?.filter((d: any) => d.isCorrect).length || 0}/${res.totalQuestions || 40}`,
      'Thời gian nộp': new Date(res.submittedAt).toLocaleString('vi-VN')
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bảng điểm tổng hợp");
    
    // Auto-size columns
    const wscols = [
      { wch: 5 }, { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 20 }
    ];
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `Bang_diem_tong_hop_${exam?.title || 'Unknown'}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col font-sans">
      <div className="p-4 bg-white border-b flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <Camera className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Quét phiếu OMR AI</h2>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-tighter">Tự động căn chỉnh & Chấm điểm</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <X className="w-6 h-6 text-slate-600" />
        </button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: Camera/Captured Image Content */}
        <div className="flex-1 bg-black relative flex items-center justify-center p-4">
          {isCameraOpen ? (
            <div className="relative w-full h-full max-w-2xl bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              {/* Perspective Frame Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[85%] h-[85%] border-2 border-indigo-400/50 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
                  {/* Corner marks */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-400 rounded-br-lg"></div>
                  
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50 text-xs font-bold text-center">
                    Căn phiếu vào khung<br/>AI sẽ tự động làm phẳng ảnh
                  </div>
                </div>
              </div>
              
              <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-8 items-center">
                <button 
                  onClick={stopCamera}
                  className="bg-white/20 backdrop-blur-md p-4 rounded-full text-white hover:bg-white/30"
                >
                  <X className="w-6 h-6" />
                </button>
                <button 
                  onClick={captureImage}
                  className="w-20 h-20 bg-white rounded-full p-2 shadow-2xl hover:scale-105 transition-transform"
                >
                  <div className="w-full h-full border-4 border-indigo-600 rounded-full flex items-center justify-center">
                    <div className="w-12 h-12 bg-indigo-600 rounded-full"></div>
                  </div>
                </button>
                <div className="w-14"></div> {/* Spacer for symmetry */}
              </div>
            </div>
          ) : capturedImage ? (
            <div className="relative w-full h-full max-w-2xl flex flex-col">
              <div className="flex-1 bg-slate-800 rounded-3xl overflow-hidden border-4 border-indigo-500/30 shadow-2xl relative">
                <img src={capturedImage} alt="Captured" className="w-full h-full object-contain" />
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center">
                    <Loader2 className="w-16 h-16 text-indigo-400 animate-spin mb-4" />
                    <h3 className="text-xl font-bold mb-2">Đang xử lý OMR...</h3>
                    <p className="text-slate-300 text-sm">Đang căn chỉnh, giải mã SBD, Mã đề và chấm đáp án</p>
                    <div className="mt-8 w-64 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 animate-[loading_2s_infinite]"></div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-center gap-4 mt-6">
                <button 
                  onClick={() => { setCapturedImage(null); startCamera(); }}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-6 py-4 bg-white/10 text-white rounded-2xl hover:bg-white/20 transition-all font-bold disabled:opacity-50"
                >
                  <RefreshCw className="w-5 h-5" />
                  Chụp lại
                </button>
                <button 
                  onClick={processImageWithGemini}
                  disabled={isProcessing}
                  className="flex items-center gap-3 px-10 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  Phân tích phiếu OMR
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center p-12 bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 shadow-2xl max-w-md w-full">
              <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl rotate-3">
                <Camera className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Sẵn sàng chấm bài</h3>
              <p className="text-slate-400 mb-10">Vui lòng sử dụng camera để quét các phiếu trả lời OMR đúng theo mẫu chuẩn của Bộ Giáo Dục.</p>
              
              <div className="space-y-4">
                <button 
                  onClick={startCamera}
                  className="w-full py-5 bg-white text-indigo-900 rounded-2xl font-black text-lg hover:bg-slate-100 transition-all shadow-xl shadow-white/5 active:scale-95"
                >
                  Bắt đầu quét
                </button>
                
                <div className="relative flex items-center py-4">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink mx-4 text-slate-500 text-xs font-bold uppercase">Hoặc</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                <label className="flex items-center justify-center gap-3 w-full py-4 text-slate-300 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 cursor-pointer transition-all">
                  <ImageIcon className="w-5 h-5" />
                  <span className="font-bold">Chọn ảnh từ thư viện</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (re) => setCapturedImage(re.target?.result as string);
                        reader.readAsDataURL(file);
                      }
                    }} 
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Right: Detailed Inspection panel */}
        <div className="w-full md:w-[400px] bg-slate-50 border-l border-slate-200 overflow-y-auto">
          <div className="p-6 sticky top-0 bg-slate-50 z-10 border-b flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Kết quả & Báo cáo</h3>
            {allExamResults.length > 0 && (
              <button 
                onClick={handleExportAllResults}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                title="Xuất bảng điểm tổng hợp"
              >
                <Download className="w-4 h-4" />
                Tổng hợp
              </button>
            )}
          </div>

          <div className="p-6">
            {results ? (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 -mr-12 -mt-12 rounded-full"></div>
                  <div className="relative">
                    <div className="flex items-center gap-2 text-emerald-600 mb-4 font-bold text-sm">
                      <CheckCircle className="w-4 h-4" /> Phân tích thành công
                    </div>
                    
                    <div className="flex gap-4 mb-6">
                      <div className="flex-1 bg-slate-50 p-3 rounded-2xl">
                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Số báo danh</div>
                        <div className="font-black text-slate-800 text-xl">{results.sbd || '---'}</div>
                      </div>
                      <div className="flex-1 bg-slate-50 p-3 rounded-2xl">
                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Mã đề thi</div>
                        <div className="font-black text-slate-800 text-xl">{results.maDe || '---'}</div>
                      </div>
                    </div>

                    <div className="p-6 bg-indigo-600 rounded-3xl text-white text-center shadow-xl shadow-indigo-200">
                      <div className="text-indigo-200 text-[10px] font-black uppercase tracking-widest mb-1">Điểm AI chấm</div>
                      <div className="text-5xl font-black mb-1">{results.score.toFixed(2)}</div>
                      <div className="text-xs text-indigo-200">Số câu đúng: {results.correctCount}/{results.totalCount}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800">Chi tiết Phần I (Trắc nghiệm)</h4>
                    <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-full font-bold">40 CÂU</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {results.details.map((d: any) => (
                      <div key={d.question} className={`p-1.5 rounded-xl text-center border transition-all ${
                        d.isCorrect ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
                      }`}>
                        <div className="text-[8px] font-bold opacity-50">{d.question}</div>
                        <div className="font-black text-sm">{d.studentAnswer || '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-6">
                  <button 
                    onClick={handleSaveResult}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    Lưu kết quả & Tiếp tục quét
                  </button>
                  <button 
                    onClick={() => { setResults(null); setCapturedImage(null); startCamera(); }}
                    className="w-full py-4 bg-white text-slate-600 border border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-all"
                  >
                    Hủy bỏ
                  </button>
                </div>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h4 className="font-bold text-slate-800 mb-2">Lỗi quét phiếu</h4>
                <p className="text-sm text-slate-500 mb-6">{error}</p>
                <button 
                  onClick={() => { setCapturedImage(null); startCamera(); }}
                  className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold"
                >
                  Thử lại ngay
                </button>
              </div>
            ) : (
              <div className="text-center py-20 px-4">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Download className="w-8 h-8 text-slate-300" />
                </div>
                <h4 className="font-bold text-slate-800 mb-2">Chưa có dữ liệu scan</h4>
                <p className="text-xs text-slate-500">Kết quả chi tiết của học sinh sẽ hiện thị ở đây sau khi bạn nhấn "Phân tích phiếu".</p>
                
                {/* {allExamResults.length > 0 && (
                  <div className="mt-12 text-left">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Kết quả đã lưu ({allExamResults.length})</h5>
                    <div className="space-y-2">
                      {allExamResults.slice(0, 5).map((res: any) => (
                        <div key={res.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                          <div>
                            <div className="text-xs font-bold text-slate-800">{res.studentName}</div>
                            <div className="text-[10px] text-slate-400">SBD: {res.studentSbd} • {new Date(res.submittedAt).toLocaleTimeString()}</div>
                          </div>
                          <div className="font-black text-indigo-600">{res.score?.toFixed(1)}</div>
                        </div>
                      ))}
                      {allExamResults.length > 5 && (
                        <div className="text-center text-[10px] text-slate-400 font-bold pt-2">Và {allExamResults.length - 5} học sinh khác...</div>
                      )}
                    </div>
                  </div>
                )} */}
              </div>
            )}
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
      
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
