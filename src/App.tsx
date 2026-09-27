import React, { useState } from 'react';
import { Zap, Loader2, Download, CheckCircle2, ShieldAlert, ShieldCheck, RefreshCw } from 'lucide-react';
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // File drop / select handler with explicit state reset
  const handleFileSelect = async (file: File) => {
    // Explicitly reset all state variables
    setInspection(null);
    setSanitizationResult(null);
    setIsSanitizing(false);
    setIsLoading(true);
    setCurrentFile(file);

    try {
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
    if (!currentFile || !inspection || inspection.items.length === 0) return;

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

  const hasMetadataToClean = inspection && inspection.items.length > 0;

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

                {/* 4. Selective Cleaning Switches (Context-Aware) */}
                {hasMetadataToClean && (
                  <PurgeControls
                    options={cleaningOptions}
                    onChange={setCleaningOptions}
                    inspection={inspection}
                  />
                )}

                {/* 5. Primary Action & Clean Button */}
                <div className="flex flex-col gap-3 pt-2">
                  {hasMetadataToClean ? (
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
                  ) : (
                    /* Disabled Button when no metadata was detected */
                    <button
                      type="button"
                      disabled
                      className="w-full py-4 px-6 rounded-xl bg-surface-container-high text-on-surface-variant/60 font-semibold text-sm sm:text-base border border-surface-container-highest flex items-center justify-center gap-2.5 cursor-not-allowed select-none"
                    >
                      <ShieldCheck className="w-5 h-5 text-secondary/70" />
                      <span>No Metadata Detected — File is Already Clean</span>
                    </button>
                  )}

                  {hasMetadataToClean && (
                    <p className="text-center text-xs font-mono text-on-surface-variant">
                      Downloads as <span className="text-primary font-medium">{cleanedName}</span> • 100% In-Browser
                    </p>
                  )}

                  {/* 6. Post-Clean Savings Stats & Workflow Banner */}
                  {sanitizationResult && currentFile && (
                    <div className="p-4 sm:p-5 rounded-2xl bg-surface-container-high/80 border border-primary/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2 shadow-md">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-primary font-mono text-xs sm:text-sm font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-secondary flex-shrink-0" />
                          <span>File Sanitized Successfully</span>
                        </div>
                        <p className="text-xs text-on-surface-variant font-mono">
                          Original: <span className="text-on-surface font-semibold">{formatBytes(currentFile.size)}</span> ➔ Sanitized: <span className="text-secondary font-semibold">{formatBytes(sanitizationResult.cleanedFileSize)}</span>
                          {sanitizationResult.bytesReduced > 0 && (
                            <span className="text-primary font-semibold ml-1.5">
                              (-{((sanitizationResult.bytesReduced / currentFile.size) * 100).toFixed(1)}% stripped)
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => downloadBlob(sanitizationResult.cleanedBlob, sanitizationResult.cleanedFileName)}
                          className="px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-highest text-on-surface text-xs font-mono font-medium flex items-center gap-1.5 transition-colors border border-surface-container-highest"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Re-Download</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleClearFile}
                          className="px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary-container text-xs font-mono font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Clean Another File</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 7. Polished Privacy Disclaimer Footer */}
        <footer className="mt-8 pt-6 border-t border-surface-container-high/60">
          <div className="p-3.5 sm:p-4 rounded-xl bg-surface-container-low/60 border border-surface-container-high/80 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface-variant/80 leading-relaxed">
              <strong className="text-on-surface font-semibold">Disclaimer:</strong> Metadata removal cleans embedded file properties. It does not obscure network IP addresses, server logs, or account records.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
