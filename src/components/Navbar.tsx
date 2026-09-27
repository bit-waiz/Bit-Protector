import React from 'react';
import { Code, ArrowUpRight, HelpCircle } from 'lucide-react';

interface NavbarProps {
  activeTab: 'app' | 'faq';
  onTabChange: (tab: 'app' | 'faq') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  return (
    <header className="sticky top-0 z-50 px-3 sm:px-6 lg:px-8 py-3 backdrop-blur-md bg-surface-container-lowest/90 border-b border-surface-container-high/40">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">

        {/* Logo & Title — single clean row on all viewports */}
        <button
          type="button"
          onClick={() => onTabChange('app')}
          className="flex items-center gap-2.5 text-left cursor-pointer group min-w-0 shrink-0"
          aria-label="Bit Protector home"
        >
          <img
            src="/logo.png"
            alt="Bit Protector Logo"
            className="h-8 w-8 sm:h-9 sm:w-auto object-contain rounded-lg shadow-sm group-hover:scale-105 transition-transform flex-shrink-0"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
          {/* Title + Tagline stacked */}
          <div className="min-w-0">
            <span className="font-bold text-base sm:text-lg text-primary tracking-tight block leading-tight whitespace-nowrap">
              Bit Protector
            </span>
            {/* Tagline: hidden on xs, visible from md up */}
            <span className="hidden md:block text-xs text-on-surface-variant font-medium whitespace-nowrap">
              100% In-Browser Privacy
            </span>
          </div>
        </button>

        {/* Navigation pill group + GitHub */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Nav pills */}
          <nav
            className="flex items-center gap-0.5 sm:gap-1 bg-surface-container-high/60 p-1 rounded-full border border-surface-container-highest"
            aria-label="Primary navigation"
          >
            <button
              type="button"
              onClick={() => onTabChange('app')}
              className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-mono transition-all ${
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
              className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-mono transition-all flex items-center gap-1 ${
                activeTab === 'faq'
                  ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <HelpCircle className="w-3 h-3 flex-shrink-0" />
              <span>FAQ</span>
            </button>
          </nav>

          {/* GitHub Link */}
          <a
            href="https://github.com/bit-waiz/Bit-Protector"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-mono transition-all border border-surface-container-highest"
            title="GitHub Repository"
            aria-label="View source on GitHub"
          >
            <Code className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="hidden sm:inline">Source</span>
            <ArrowUpRight className="w-3 h-3 text-on-surface-variant flex-shrink-0" />
          </a>
        </div>
      </div>
    </header>
  );
};
