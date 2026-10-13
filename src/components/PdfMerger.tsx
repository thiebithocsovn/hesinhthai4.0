import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  Files,
  Scissors,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { motion, AnimatePresence } from 'motion/react';
import {
  createSinglePageRanges,
  createStoredZip,
  parsePdfPageRanges,
  splitPdfByRanges,
  type SplitPdfResult,
} from '../lib/pdfTools';

interface PdfMergerProps {
  onBack: () => void;
}

interface FileItem {
  id: string;
  file: globalThis.File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMessage?: string;
}

interface SplitSource {
  file: globalThis.File;
  bytes: Uint8Array;
  pageCount: number;
}

interface DownloadableSplitResult extends SplitPdfResult {
  url: string;
}

type PdfOperation = 'merge' | 'split';
type SplitMode = 'each' | 'ranges' | 'selected';

const SPLIT_OPTIONS: Array<{
  id: SplitMode;
  title: string;
  description: string;
}> = [
  {
    id: 'each',
    title: 'Tách từng trang',
    description: 'Mỗi trang trở thành một tệp PDF riêng.',
  },
  {
    id: 'ranges',
    title: 'Tách theo khoảng trang',
    description: 'Mỗi khoảng trang tạo một tệp PDF riêng.',
  },
  {
    id: 'selected',
    title: 'Trích các trang đã chọn',
    description: 'Gộp những trang cần lấy thành một PDF mới.',
  },
];

function describePdfError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;

  if (/encrypt|password/i.test(message)) {
    return 'Tệp PDF đang được bảo vệ bằng mật khẩu. Hãy mở khóa tệp trước khi xử lý.';
  }

  if (/no pdf header|invalid pdf|failed to parse/i.test(message)) {
    return 'Không thể đọc tệp PDF. Hãy kiểm tra tệp có bị hỏng hoặc sai định dạng không.';
  }

  return message || fallback;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** index).toFixed(2))} ${units[index]}`;
}

function downloadObjectUrl(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function PdfMerger({ onBack }: PdfMergerProps) {
  const [operation, setOperation] = useState<PdfOperation>('merge');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState('');
  const [splitSource, setSplitSource] = useState<SplitSource | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>('each');
  const [pageSelection, setPageSelection] = useState('');
  const [splitResults, setSplitResults] = useState<DownloadableSplitResult[]>([]);
  const [isReadingSource, setIsReadingSource] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitError, setSplitError] = useState('');
  const uploadInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (mergedPdfUrl) URL.revokeObjectURL(mergedPdfUrl);
  }, [mergedPdfUrl]);

  useEffect(() => () => {
    splitResults.forEach(result => URL.revokeObjectURL(result.url));
  }, [splitResults]);

  const appendMergeFiles = (selectedFiles: globalThis.File[]) => {
    const pdfs = selectedFiles.filter(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));

    if (pdfs.length === 0) {
      setMergeError('Vui lòng chọn tệp có định dạng PDF.');
      return;
    }

    const newFiles = pdfs.map(file => ({
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending' as const,
    }));

    setFiles(previous => [...previous, ...newFiles]);
    setMergedPdfUrl(null);
    setMergeError('');
  };

  const loadSplitSource = async (file: globalThis.File | undefined) => {
    if (!file) return;

    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      setSplitError('Vui lòng chọn tệp có định dạng PDF.');
      return;
    }

    setIsReadingSource(true);
    setSplitSource(null);
    setSplitResults([]);
    setPageSelection('');
    setSplitError('');

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await PDFDocument.load(bytes);
      setSplitSource({ file, bytes, pageCount: pdf.getPageCount() });
    } catch (error) {
      setSplitError(describePdfError(error, 'Không thể mở tệp PDF đã chọn.'));
    } finally {
      setIsReadingSource(false);
    }
  };

  const handleSelectedFiles = (selectedFiles: globalThis.File[]) => {
    if (operation === 'merge') {
      appendMergeFiles(selectedFiles);
      return;
    }

    void loadSplitSource(selectedFiles[0]);
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleSelectedFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const removeFile = (id: string) => {
    setFiles(previous => previous.filter(file => file.id !== id));
    setMergedPdfUrl(null);
    setMergeError('');
  };

  const moveFile = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= files.length) return;

    setFiles(previous => {
      const reordered = [...previous];
      [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
      return reordered.map(item => ({ ...item, status: 'pending' as const, errorMessage: undefined }));
    });
    setMergedPdfUrl(null);
  };

  const mergePdfs = async () => {
    if (files.length < 2) {
      setMergeError('Vui lòng chọn ít nhất 2 tệp PDF để gộp.');
      return;
    }

    setIsMerging(true);
    setMergedPdfUrl(null);
    setMergeError('');

    try {
      const mergedPdf = await PDFDocument.create();
      const updatedFiles: FileItem[] = files.map(file => ({ ...file, status: 'pending', errorMessage: undefined }));

      for (let index = 0; index < updatedFiles.length; index += 1) {
        const item = updatedFiles[index];
        item.status = 'processing';
        setFiles([...updatedFiles]);

        try {
          const pdf = await PDFDocument.load(await item.file.arrayBuffer());
          const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach(page => mergedPdf.addPage(page));
          item.status = 'done';
        } catch (error) {
          item.status = 'error';
          item.errorMessage = describePdfError(error, 'Không thể đọc hoặc xử lý tệp PDF.');
        }

        setFiles([...updatedFiles]);
      }

      const failedFile = updatedFiles.find(file => file.status === 'error');
      if (failedFile) {
        throw new Error(`${failedFile.name}: ${failedFile.errorMessage || 'Không thể xử lý tệp.'}`);
      }

      const mergedPdfBytes = await mergedPdf.save();
      setMergedPdfUrl(URL.createObjectURL(new Blob([new Uint8Array(mergedPdfBytes)], { type: 'application/pdf' })));
    } catch (error) {
      setMergeError(describePdfError(error, 'Có lỗi xảy ra khi gộp các tệp PDF.'));
    } finally {
      setIsMerging(false);
    }
  };

  const splitPdf = async () => {
    if (!splitSource) {
      setSplitError('Vui lòng chọn một tệp PDF cần tách.');
      return;
    }

    setIsSplitting(true);
    setSplitResults([]);
    setSplitError('');

    try {
      const ranges = splitMode === 'each'
        ? createSinglePageRanges(splitSource.pageCount)
        : parsePdfPageRanges(pageSelection, splitSource.pageCount);
      const results = await splitPdfByRanges(
        splitSource.bytes,
        splitSource.file.name,
        ranges,
        splitMode === 'selected',
      );

      setSplitResults(results.map(result => ({
        ...result,
        url: URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: 'application/pdf' })),
      })));
    } catch (error) {
      setSplitError(describePdfError(error, 'Không thể tách tệp PDF đã chọn.'));
    } finally {
      setIsSplitting(false);
    }
  };

  const downloadSplitArchive = () => {
    if (!splitSource || splitResults.length === 0) return;

    try {
      const archive = createStoredZip(splitResults.map(result => ({
        fileName: result.fileName,
        bytes: result.bytes,
      })));
      const url = URL.createObjectURL(new Blob([new Uint8Array(archive)], { type: 'application/zip' }));
      const sourceName = splitSource.file.name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_');
      downloadObjectUrl(url, `${sourceName || 'tai_lieu'}_da_tach.zip`);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setSplitError(describePdfError(error, 'Không thể tạo tệp ZIP để tải xuống.'));
    }
  };

  const currentError = operation === 'merge' ? mergeError : splitError;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors" aria-label="Quay lại">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-lg md:text-2xl font-bold text-slate-800 flex items-center gap-2 truncate">
            <FileText className="w-6 h-6 text-red-600 shrink-0" />
            Tách, gộp file PDF
          </h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-10 flex justify-center bg-slate-200/50">
        <div className="w-full max-w-[920px] min-h-[750px] bg-white shadow-xl rounded-2xl border border-slate-200 p-5 md:p-12 flex flex-col">
          <div className="flex-1 space-y-8">
            <div className="text-center">
              <div className="inline-flex p-3 bg-red-50 rounded-full mb-4">
                {operation === 'split' ? <Scissors className="w-8 h-8 text-red-600" /> : <Files className="w-8 h-8 text-red-600" />}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">Tách, gộp file PDF</h2>
              <p className="text-slate-500 max-w-xl mx-auto">
                Xử lý tài liệu ngay trên thiết bị, không tải tệp lên máy chủ và không phát sinh lượt ghi Firebase.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100" role="tablist" aria-label="Chức năng PDF">
              {([
                { id: 'merge' as const, label: 'Gộp file PDF', icon: Files },
                { id: 'split' as const, label: 'Tách file PDF', icon: Scissors },
              ]).map(option => {
                const Icon = option.icon;
                const selected = operation === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setOperation(option.id)}
                    className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm md:text-base font-semibold transition-all ${selected ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Icon className="w-4 h-4 md:w-5 h-5" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => uploadInput.current?.click()}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  uploadInput.current?.click();
                }
              }}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                handleSelectedFiles(Array.from(event.dataTransfer.files));
              }}
              className="border-2 border-dashed border-slate-300 rounded-2xl p-8 md:p-12 flex flex-col items-center justify-center bg-slate-50 hover:bg-red-50/30 hover:border-red-200 transition-all cursor-pointer group"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-sm">
                <Upload className="w-8 h-8" />
              </div>
              <p className="text-slate-800 font-bold text-base md:text-lg mb-2 text-center">
                {operation === 'merge' ? 'Kéo và thả các tệp PDF cần gộp' : 'Chọn một tệp PDF cần tách'}
              </p>
              <p className="text-slate-500 text-sm mb-4 text-center">
                {operation === 'merge' ? 'Có thể chọn nhiều tệp và điều chỉnh thứ tự trước khi gộp.' : 'Hệ thống tự nhận biết tổng số trang của tài liệu.'}
              </p>
              <span className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 font-medium group-hover:bg-red-600 group-hover:text-white group-hover:border-red-600 transition-colors shadow-sm">
                {isReadingSource ? 'Đang đọc tệp...' : 'Chọn tệp PDF'}
              </span>
              <input
                ref={uploadInput}
                type="file"
                multiple={operation === 'merge'}
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            {currentError && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="text-sm">{currentError}</span>
              </div>
            )}

            {operation === 'merge' && files.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 text-base md:text-lg">Danh sách tệp ({files.length})</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setFiles([]);
                      setMergedPdfUrl(null);
                      setMergeError('');
                    }}
                    className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                  >
                    <X className="w-4 h-4" /> Xóa tất cả
                  </button>
                </div>

                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {files.map((file, index) => (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        className="flex items-center justify-between gap-3 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-white border border-slate-200 text-red-600 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">{file.name}</p>
                            <p className="text-xs text-slate-400">{formatSize(file.size)}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {file.status === 'processing' && <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />}
                          {file.status === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                          {file.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" aria-label={file.errorMessage} />}
                          <button type="button" disabled={isMerging || index === 0} onClick={() => moveFile(index, -1)} aria-label={`Đưa ${file.name} lên trên`} className="p-1.5 text-slate-500 hover:text-red-600 disabled:opacity-30">
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button type="button" disabled={isMerging || index === files.length - 1} onClick={() => moveFile(index, 1)} aria-label={`Đưa ${file.name} xuống dưới`} className="p-1.5 text-slate-500 hover:text-red-600 disabled:opacity-30">
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button type="button" disabled={isMerging} onClick={() => removeFile(file.id)} aria-label={`Xóa ${file.name}`} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-30">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <div className="mt-7 flex flex-col gap-3">
                  <button type="button" disabled={isMerging || files.length < 2} onClick={() => void mergePdfs()} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isMerging ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang gộp tài liệu...</> : <><Files className="w-5 h-5" /> Gộp thành một file PDF</>}
                  </button>

                  {mergedPdfUrl && (
                    <button type="button" onClick={() => downloadObjectUrl(mergedPdfUrl, 'tai_lieu_da_gop.pdf')} className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-bold py-4 rounded-xl hover:bg-red-700">
                      <Download className="w-5 h-5" /> Tải file PDF đã gộp
                    </button>
                  )}
                </div>
              </div>
            )}

            {operation === 'split' && splitSource && (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-100 bg-red-50/50 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-xl bg-white p-2 text-red-600"><FileText className="w-6 h-6" /></div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{splitSource.file.name}</p>
                      <p className="text-sm text-slate-500">{splitSource.pageCount} trang · {formatSize(splitSource.file.size)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => {
                    setSplitSource(null);
                    setSplitResults([]);
                    setPageSelection('');
                    setSplitError('');
                  }} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white" aria-label="Xóa tệp PDF đã chọn">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <h3 className="font-bold text-slate-800 mb-3">Chọn cách tách PDF</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    {SPLIT_OPTIONS.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setSplitMode(option.id);
                          setSplitResults([]);
                          setSplitError('');
                        }}
                        className={`rounded-xl border p-4 text-left transition-colors ${splitMode === option.id ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-red-200'}`}
                      >
                        <span className={`block font-semibold text-sm ${splitMode === option.id ? 'text-red-700' : 'text-slate-800'}`}>{option.title}</span>
                        <span className="block mt-1 text-xs leading-5 text-slate-500">{option.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {splitMode !== 'each' && (
                  <label className="block">
                    <span className="font-semibold text-sm text-slate-700">Nhập trang hoặc khoảng trang</span>
                    <input
                      value={pageSelection}
                      onChange={event => {
                        setPageSelection(event.target.value);
                        setSplitResults([]);
                        setSplitError('');
                      }}
                      placeholder="Ví dụ: 1-3, 5, 8-10"
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                    />
                    <span className="block mt-2 text-xs text-slate-500">
                      {splitMode === 'ranges' ? 'Mỗi nhóm được phân cách bằng dấu phẩy sẽ tạo một tệp PDF riêng.' : 'Tất cả các trang đã chọn sẽ nằm trong cùng một tệp PDF mới.'}
                    </span>
                  </label>
                )}

                <button type="button" disabled={isSplitting || isReadingSource} onClick={() => void splitPdf()} className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-4 font-bold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSplitting ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang tách PDF...</> : <><Scissors className="w-5 h-5" /> {splitMode === 'selected' ? 'Trích các trang đã chọn' : 'Tách file PDF'}</>}
                </button>

                {splitResults.length > 0 && (
                  <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 md:p-5">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <CheckCircle2 className="w-5 h-5" />
                      <h3 className="font-bold">Đã tạo {splitResults.length} tệp PDF</h3>
                    </div>

                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {splitResults.map((result, index) => (
                        <div key={`${result.fileName}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-white p-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <FilePlus2 className="w-5 h-5 text-red-600 shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">{result.fileName}</p>
                              <p className="text-xs text-slate-500">{result.pageNumbers.length} trang · {formatSize(result.bytes.length)}</p>
                            </div>
                          </div>
                          <button type="button" onClick={() => downloadObjectUrl(result.url, result.fileName)} className="shrink-0 rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100" aria-label={`Tải ${result.fileName}`}>
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {splitResults.length > 1 && (
                      <button type="button" onClick={downloadSplitArchive} className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-bold text-white hover:bg-red-700">
                        <Archive className="w-5 h-5" /> Tải tất cả dưới dạng ZIP
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-5 md:p-6">
            <h4 className="flex items-center gap-2 font-bold text-slate-800 mb-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600" /> Bảo mật và hướng dẫn
            </h4>
            <ul className="space-y-2 pl-5 text-sm text-slate-600 list-disc">
              <li>Tệp PDF được xử lý trực tiếp trên trình duyệt, không gửi lên máy chủ hoặc Firebase.</li>
              <li>Khi gộp, sử dụng nút lên/xuống để sắp xếp đúng thứ tự các tài liệu.</li>
              <li>Khi tách, có thể lấy từng trang, từng khoảng trang hoặc trích nhiều trang vào một tệp.</li>
              <li>Tài liệu gốc không bị thay đổi; các tệp đã tách có thể tải riêng hoặc tải chung thành ZIP.</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
