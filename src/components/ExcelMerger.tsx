import React, { useState, useCallback } from 'react';
import { Upload, ArrowLeft, FileSpreadsheet, X, Download, AlertCircle, CheckCircle2, ChevronRight, File as FileIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

interface ExcelMergerProps {
  onBack: () => void;
}

interface FileItem {
  id: string;
  file: globalThis.File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMessage?: string;
  data?: any[];
}

export default function ExcelMerger({ onBack }: ExcelMergerProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedData, setMergedData] = useState<any[] | null>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files as FileList).map((file: globalThis.File) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        size: file.size,
        status: 'pending' as const
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const mergeFiles = async () => {
    if (files.length === 0) return;
    setIsMerging(true);
    
    try {
      const allRows: any[] = [];
      const updatedFiles = [...files];

      for (let i = 0; i < updatedFiles.length; i++) {
        const item = updatedFiles[i];
        item.status = 'processing';
        setFiles([...updatedFiles]);

        try {
          const buffer = await item.file.arrayBuffer();
          const workbook = XLSX.read(buffer);
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const data = XLSX.utils.sheet_to_json(worksheet);
          
          allRows.push(...data);
          item.status = 'done';
        } catch (err) {
          item.status = 'error';
          item.errorMessage = 'Không thể đọc file';
        }
        setFiles([...updatedFiles]);
      }

      setMergedData(allRows);
    } catch (error) {
      console.error("Merge error:", error);
    } finally {
      setIsMerging(false);
    }
  };

  const downloadMerged = () => {
    if (!mergedData) return;
    const worksheet = XLSX.utils.json_to_sheet(mergedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Merged");
    XLSX.writeFile(workbook, "merged_excel_files.xlsx");
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            Gộp nhiều file Excel
          </h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold text-slate-800 mb-2">Tải lên các tệp Excel cần gộp</h2>
              <p className="text-slate-500">Hệ thống sẽ lấy dữ liệu từ trang tính đầu tiên của mỗi tệp và gộp chúng lại.</p>
            </div>

            <div 
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative group"
              onClick={() => document.getElementById('excel-upload')?.click()}
            >
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8" />
              </div>
              <p className="text-slate-700 font-medium mb-1">Kéo và thả tệp vào đây hoặc nhấn để chọn</p>
              <p className="text-slate-400 text-sm">Hỗ trợ định dạng .xlsx, .xls, .csv</p>
              <input 
                id="excel-upload"
                type="file" 
                multiple
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            {files.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-800">Danh sách tệp ({files.length})</h3>
                  <button 
                    onClick={() => setFiles([])}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Xóa tất cả
                  </button>
                </div>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {files.map((file) => (
                      <motion.div 
                        key={file.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                            <FileIcon className="w-5 h-5" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="font-medium text-slate-800 text-sm truncate">{file.name}</p>
                            <p className="text-xs text-slate-400">{formatSize(file.size)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {file.status === 'processing' && (
                            <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                          )}
                          {file.status === 'done' && (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          )}
                          {file.status === 'error' && (
                            <div title={file.errorMessage}>
                              <AlertCircle className="w-5 h-5 text-red-500" />
                            </div>
                          )}
                          <button 
                            onClick={() => removeFile(file.id)}
                            className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <div className="mt-8 flex gap-4">
                  <button 
                    disabled={isMerging || files.length === 0}
                    onClick={mergeFiles}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-200"
                  >
                    {isMerging ? 'Đang gộp...' : 'Bắt đầu gộp tệp'}
                  </button>
                  {mergedData && (
                    <button 
                      onClick={downloadMerged}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-200"
                    >
                      <Download className="w-5 h-5" />
                      Tải file đã gộp ({mergedData.length} dòng)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
            <h4 className="flex items-center gap-2 font-bold text-indigo-900 mb-2">
              <AlertCircle className="w-5 h-5" />
              Lưu ý quan trọng
            </h4>
            <ul className="text-indigo-700 text-sm space-y-1 list-disc pl-5">
              <li>Các tệp nên có cấu trúc tiêu đề cột giống nhau để đảm bảo dữ liệu được gộp chính xác.</li>
              <li>Công cụ này xử lý dữ liệu hoàn toàn trên trình duyệt của bạn, đảm bảo tính riêng tư.</li>
              <li>Nếu tệp quá lớn (hàng trăm MB), trình duyệt có thể bị chậm.</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
