import React from 'react';
import { Code, ArrowUpRight, HelpCircle, Shield } from 'lucide-react';

interface NavbarProps {
  activeTab: 'app' | 'faq';
  onTabChange: (tab: 'app' | 'faq') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  return (
    <header className="sticky top-0 z-50 px-4 sm:px-6 lg:px-8 py-3.5 backdrop-blur-md bg-surface-container-lowest/90 border-b border-surface-container-high/40">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        {/* Logo & Title */}
        <button
          type="button"
          onClick={() => onTabChange('app')}
          className="flex items-center gap-3 text-left cursor-pointer group"
        >
          <img
            src="/logo.png"
            alt="Bit Protector Logo"
            className="h-9 w-auto object-contain rounded-lg shadow-sm group-hover:scale-105 transition-transform"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
          <div>
            <span className="font-bold text-lg text-primary tracking-tight block leading-tight">
              Bit Protector
            </span>
            <span className="text-xs text-on-surface-variant font-medium">
              100% In-Browser Privacy
            </span>
          </div>
        </button>

        {/* Navigation & GitHub Link */}
        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="flex items-center gap-1 bg-surface-container-high/60 p-1 rounded-full border border-surface-container-highest">
            <button
              type="button"
              onClick={() => onTabChange('app')}
              className={`px-3 py-1 rounded-full text-xs font-mono transition-all ${
                activeTab === 'app'
                  ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Sanitizer
            </button>
            <button
              type="button"
              onClick={() => onTabChange('faq')}
              className={`px-3 py-1 rounded-full text-xs font-mono transition-all flex items-center gap-1 ${
                activeTab === 'faq'
                  ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <HelpCircle className="w-3 h-3" />
              <span>FAQ</span>
            </button>
          </nav>

          {/* GitHub Link */}
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-mono transition-all border border-surface-container-highest"
            title="GitHub Repository"
          >
            <Code className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Source</span>
            <ArrowUpRight className="w-3 h-3 text-on-surface-variant" />
          </a>
        </div>
      </div>
    </header>
  );
};
