import React from 'react';
import { MapPinOff, Cpu, UserX, Clock, CheckSquare, Square } from 'lucide-react';
import { CleaningOptions } from '../lib/types';

interface PurgeControlsProps {
  options: CleaningOptions;
  onChange: (options: CleaningOptions) => void;
}

export const PurgeControls: React.FC<PurgeControlsProps> = ({ options, onChange }) => {
  const isAllSelected = options.stripGps && options.stripDevice && options.stripAuthor && options.stripTimestamps;

  const toggleAll = () => {
    const nextVal = !isAllSelected;
    onChange({
      stripGps: nextVal,
      stripDevice: nextVal,
      stripAuthor: nextVal,
      stripTimestamps: nextVal,
    });
  };

  const toggleOption = (key: keyof CleaningOptions) => {
    onChange({
      ...options,
      [key]: !options[key],
    });
  };

  const controls = [
    {
      key: 'stripGps' as keyof CleaningOptions,
      title: 'Remove GPS & Location Data',
      subtitle: 'Coordinates, altitude, precision & ephemeris tags',
      icon: MapPinOff,
    },
    {
      key: 'stripDevice' as keyof CleaningOptions,
      title: 'Remove Camera & Device Identifiers',
      subtitle: 'Make, model, lens profile, serial numbers & software',
      icon: Cpu,
    },
    {
      key: 'stripAuthor' as keyof CleaningOptions,
      title: 'Remove Author, Creator & Document Properties',
      subtitle: 'Author names, workstation IDs, company & review threads',
      icon: UserX,
    },
    {
      key: 'stripTimestamps' as keyof CleaningOptions,
      title: 'Remove Timestamps & Edit History',
      subtitle: 'Creation dates, modification timestamps & edit counters',
      icon: Clock,
    },
  ];

  return (
    <div className="rounded-2xl bg-surface-container-low/70 p-5 sm:p-6 border border-surface-container-high/60 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-surface-container-high/60">
        <div>
          <h3 className="text-base font-semibold text-on-surface">
            Selective Metadata Removal
          </h3>
          <p className="text-xs text-on-surface-variant">
            Choose which properties to strip before downloading
          </p>
        </div>

        <button
          type="button"
          onClick={toggleAll}
          className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-mono text-xs transition-all flex items-center gap-1.5 border border-surface-container-highest font-medium"
        >
          {isAllSelected ? <CheckSquare className="w-3.5 h-3.5 text-secondary" /> : <Square className="w-3.5 h-3.5" />}
          <span>{isAllSelected ? 'All Selected' : 'Select All'}</span>
        </button>
      </div>

      {/* Switches Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {controls.map(item => {
          const Icon = item.icon;
          const isChecked = options[item.key];

          return (
            <label
              key={item.key}
              onClick={() => toggleOption(item.key)}
              className={`flex items-start justify-between p-3.5 rounded-xl transition-all cursor-pointer border select-none ${
                isChecked
                  ? 'bg-surface-container-high/90 border-primary/40 shadow-sm'
                  : 'bg-surface-container/40 hover:bg-surface-container/70 border-surface-container-highest/60 opacity-75'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 pr-2">
                <div className={`p-1.5 rounded-lg border flex-shrink-0 mt-0.5 ${
                  isChecked
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-surface-container text-outline border-surface-container-high'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className={`text-xs sm:text-sm font-medium ${isChecked ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                    {item.title}
                  </span>
                  <span className="text-[11px] text-outline line-clamp-1 mt-0.5">
                    {item.subtitle}
                  </span>
                </div>
              </div>

              {/* iOS-style toggle */}
              <div className="relative flex-shrink-0 mt-0.5">
                <div className={`w-10 h-5.5 rounded-full transition-colors flex items-center p-0.5 ${
                  isChecked ? 'bg-primary' : 'bg-surface-container-highest'
                }`}>
                  <div className={`w-4.5 h-4.5 rounded-full bg-on-primary shadow-md transform transition-transform duration-200 ${
                    isChecked ? 'translate-x-4.5' : 'translate-x-0'
                  }`} />
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};
