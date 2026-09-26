import React, { useState } from 'react';
import { HelpCircle, ChevronDown, Shield, EyeOff, FileText, Sparkles, Github } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
  icon: React.ElementType;
}

export const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FaqItem[] = [
    {
      question: "How does Bit Protector guarantee my data stays private?",
      answer: "Processing happens 100% inside your web browser's volatile memory using Web APIs and WebAssembly. No files, metadata, or telemetry are ever uploaded to any server. You can verify this anytime by inspecting your browser's Network tab.",
      icon: Shield,
    },
    {
      question: "Does metadata removal make me completely untraceable online?",
      answer: "No. Metadata removal only sanitizes internal file properties (GPS, camera info, author names). It does not alter your IP address, ISP server logs, account records, or external network traces.",
      icon: EyeOff,
    },
    {
      question: "What file formats can I inspect and clean?",
      answer: "Bit Protector supports Images (.jpg, .jpeg, .png, .webp), PDF documents (.pdf), and Microsoft Office documents (.docx, .xlsx, .pptx).",
      icon: FileText,
    },
    {
      question: "Does cleaning reduce image or document quality?",
      answer: "No. Bit Protector performs lossless header and dictionary stripping. Your visual pixels and document text remain untouched.",
      icon: Sparkles,
    },
    {
      question: "Is Bit Protector open-source?",
      answer: "Yes. The codebase is fully open-source on GitHub under the MIT License.",
      icon: Github,
    },
  ];

  return (
    <div className="rounded-2xl bg-surface-container-low/70 p-5 sm:p-7 border border-surface-container-high/60 flex flex-col gap-5 shadow-lg">
      <div className="flex items-center gap-3 pb-3 border-b border-surface-container-high/60">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <HelpCircle className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-on-surface tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-xs text-on-surface-variant">
            Zero-knowledge privacy guarantees and technical specifications
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          const Icon = faq.icon;

          return (
            <div
              key={index}
              className={`rounded-xl border transition-all overflow-hidden ${
                isOpen
                  ? 'bg-surface-container-high/70 border-primary/40 shadow-sm'
                  : 'bg-surface-container/40 hover:bg-surface-container/70 border-surface-container-highest/60'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isOpen ? 'text-primary' : 'text-outline'}`} />
                  <span className={`text-sm font-medium ${isOpen ? 'text-primary font-semibold' : 'text-on-surface'}`}>
                    {faq.question}
                  </span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-outline flex-shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-primary' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 text-xs sm:text-sm text-on-surface-variant leading-relaxed border-t border-surface-container-highest/40 font-sans">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
