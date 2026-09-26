import React, { useState } from 'react';
import { Zap, Loader2, Download, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Dropzone } from './components/Dropzone';
import { RiskVerdictBanner } from './components/RiskVerdictBanner';
import { MetadataTable } from './components/MetadataTable';
import { PurgeControls } from './components/PurgeControls';
import { FaqSection } from './components/FaqSection';
import { inspectFile } from './lib/extractor';
import { sanitizeFile } from './lib/sanitizer';
import { InspectionResult, CleaningOptions, SanitizationResult } from './lib/types';

export function App() {
  const [activeTab, setActiveTab] = useState<'app' | 'faq'>('app');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSanitizing, setIsSanitizing] = useState<boolean>(false);
  const [sanitizationResult, setSanitizationResult] = useState<SanitizationResult | null>(null);

  // Selective cleaning options
  const [cleaningOptions, setCleaningOptions] = useState<CleaningOptions>({
    stripGps: true,
    stripDevice: true,
    stripAuthor: true,
    stripTimestamps: true,
  });

  // File drop / select handler with explicit state reset
  const handleFileSelect = async (file: File) => {
    // 1. Explicitly reset all state variables
    setInspection(null);
    setSanitizationResult(null);
    setIsSanitizing(false);
    setIsLoading(true);
    setCurrentFile(file);

    try {
      // 2. Read directly without cache
      const freshResult = await inspectFile(file);
      setInspection(freshResult);
    } catch (err) {
      console.error('Error inspecting file:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearFile = () => {
    setCurrentFile(null);
    setInspection(null);
    setSanitizationResult(null);
    setIsSanitizing(false);
    setIsLoading(false);
  };

  // Clean and Download
  const handleCleanAndDownload = async () => {
    if (!currentFile || !inspection) return;

    setIsSanitizing(true);
    try {
      const result = await sanitizeFile(currentFile, inspection, cleaningOptions);
      setSanitizationResult(result);

      // Trigger immediate download
      downloadBlob(result.cleanedBlob, result.cleanedFileName);
    } catch (err) {
      console.error('Error cleaning file:', err);
    } finally {
      setIsSanitizing(false);
    }
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const baseName = currentFile?.name.substring(0, currentFile?.name.lastIndexOf('.')) || currentFile?.name || '';
  const ext = currentFile?.name.split('.').pop() || '';
  const cleanedName = `${baseName}_cleaned.${ext}`;

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col justify-between selection:bg-primary-container selection:text-on-primary-container font-sans">
      {/* 1. Header */}
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Container */}
      <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex-1 flex flex-col gap-6">
        {activeTab === 'faq' ? (
          <div className="flex flex-col gap-6 animate-fade-in">
            <FaqSection />
          </div>
        ) : (
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* Dropzone */}
            <Dropzone
              onFileSelect={handleFileSelect}
              activeFileName={currentFile?.name}
              activeFileSize={currentFile?.size}
              onClearFile={handleClearFile}
              isLoading={isLoading}
            />

            {/* Loading Spinner */}
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-on-surface-variant font-mono text-sm">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span>Inspecting file metadata in memory...</span>
              </div>
            )}

            {/* Inspected Content */}
            {inspection && !isLoading && (
              <div className="flex flex-col gap-6 animate-fade-in">
                {/* 2. Privacy Risk Verdict Banner */}
                <RiskVerdictBanner inspection={inspection} />

                {/* 3. Extracted Metadata Table (Property | Value) */}
                <MetadataTable inspection={inspection} />

                {/* 4. Selective Cleaning Switches */}
                {inspection.items.length > 0 && (
                  <PurgeControls
                    options={cleaningOptions}
                    onChange={setCleaningOptions}
                  />
                )}

                {/* 5. Primary Button: Clean & Download File */}
                <div className="flex flex-col gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isSanitizing}
                    onClick={handleCleanAndDownload}
                    className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-primary-container to-primary hover:from-primary hover:to-secondary text-on-primary-container font-semibold text-base sm:text-lg transition-all shadow-lg flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isSanitizing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Cleaning & Sanitizing...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5" />
                        <span>Clean & Download File</span>
                      </>
                    )}
                  </button>

                  <p className="text-center text-xs font-mono text-on-surface-variant">
                    Downloads as <span className="text-primary font-medium">{cleanedName}</span> • 100% In-Browser
                  </p>

                  {/* Success Notification if cleaned */}
                  {sanitizationResult && (
                    <div className="p-4 rounded-xl bg-primary-container/20 border border-secondary/40 flex items-center justify-between gap-3 text-secondary text-xs sm:text-sm font-mono mt-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>File sanitized successfully. Download started.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadBlob(sanitizationResult.cleanedBlob, sanitizationResult.cleanedFileName)}
                        className="px-3 py-1.5 rounded-lg bg-primary-container hover:bg-primary text-on-primary-container font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Re-Download</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 6. Immutable Privacy Warning Footer */}
        <footer className="mt-8 pt-6 border-t border-surface-container-high/60">
          <div className="p-4 rounded-xl bg-surface-container-low/60 border border-surface-container-high flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface-variant leading-relaxed">
              <strong className="text-on-surface font-semibold">Disclaimer:</strong> Metadata removal only wipes internal file properties. It does not obscure network IP addresses, server logs, account records, or external web trails.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
