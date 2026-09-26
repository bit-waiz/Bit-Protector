import React, { useState, useRef } from 'react';
import { UploadCloud, FolderOpen, X } from 'lucide-react';

interface DropzoneProps {
  onFileSelect: (file: File) => void;
  activeFileName?: string;
  activeFileSize?: number;
  onClearFile?: () => void;
  isLoading?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFileSelect,
  activeFileName,
  activeFileSize,
  onClearFile,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <section className="rounded-2xl bg-surface-container-low/70 p-5 sm:p-7 border border-surface-container-high/60 shadow-lg">
      {/* Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative w-full rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer border-2 border-dashed ${
          isDragOver
            ? 'border-primary bg-primary/10'
            : 'border-outline-variant/40 hover:border-primary/50 bg-surface-container-lowest/70 hover:bg-surface-container-lowest/90'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx"
          onChange={handleFileInputChange}
        />

        <div className="w-14 h-14 mb-3 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary">
          <UploadCloud className="w-7 h-7" />
        </div>

        <p className="text-base sm:text-lg font-semibold text-on-surface mb-1">
          Drag & drop a file here, or click to browse
        </p>
        <p className="text-xs sm:text-sm text-on-surface-variant mb-4">
          All processing runs 100% locally in your browser. Zero server uploads.
        </p>

        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-highest hover:bg-primary-container text-primary hover:text-on-primary-container font-mono text-xs uppercase tracking-wider font-semibold transition-all shadow-sm"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Select File
        </button>

        {/* Supported Formats */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-xs font-mono text-on-surface-variant">
          <span className="text-outline mr-1">Supported:</span>
          {['.jpg', '.png', '.webp', '.pdf', '.docx', '.xlsx', '.pptx'].map(ext => (
            <span
              key={ext}
              className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-surface-container-high"
            >
              {ext}
            </span>
          ))}
        </div>
      </div>

      {/* Active Loaded File Banner */}
      {activeFileName && (
        <div className="mt-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-container-high/90 border border-primary/30">
          <div className="truncate">
            <span className="font-semibold text-sm text-on-surface block truncate">
              {activeFileName}
            </span>
            <span className="text-xs text-on-surface-variant">
              {activeFileSize ? formatBytes(activeFileSize) : ''}
            </span>
          </div>

          {onClearFile && (
            <button
              type="button"
              onClick={onClearFile}
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-surface-container-highest transition-colors"
              title="Remove File"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </section>
  );
};
