import React from 'react';
import { MapPinOff, Cpu, UserX, Clock, CheckSquare, Square } from 'lucide-react';
import { CleaningOptions, InspectionResult } from '../lib/types';

interface PurgeControlsProps {
  options: CleaningOptions;
  onChange: (options: CleaningOptions) => void;
  inspection: InspectionResult;
}

export const PurgeControls: React.FC<PurgeControlsProps> = ({ options, onChange, inspection }) => {
  // Compute detected item counts for each category
  const gpsCount = inspection.categories.location.length + (inspection.gps.present && inspection.categories.location.length === 0 ? 1 : 0);
  const deviceCount = inspection.categories.device.length + inspection.categories.optics.length;
  const authorCount = inspection.categories.author.length + inspection.categories.document.length;
  const timestampCount = inspection.categories.timestamps.length;

  const controls = [
    {
      key: 'stripGps' as keyof CleaningOptions,
      title: 'GPS & Location Data',
      subtitle: 'Coordinates, altitude & location vectors',
      icon: MapPinOff,
      count: gpsCount,
    },
    {
      key: 'stripDevice' as keyof CleaningOptions,
      title: 'Camera & Device Identifiers',
      subtitle: 'Make, model, lens profile, serial numbers & software',
      icon: Cpu,
      count: deviceCount,
    },
    {
      key: 'stripAuthor' as keyof CleaningOptions,
      title: 'Author & Document Properties',
      subtitle: 'Author names, workstation IDs, company & review threads',
      icon: UserX,
      count: authorCount,
    },
    {
      key: 'stripTimestamps' as keyof CleaningOptions,
      title: 'Timestamps & Edit History',
      subtitle: 'Creation dates, modification timestamps & edit counters',
      icon: Clock,
      count: timestampCount,
    },
  ];

  // Active controls are those with detected items (> 0)
  const activeControls = controls.filter(c => c.count > 0);
  const allActiveSelected = activeControls.length > 0 && activeControls.every(c => options[c.key]);

  const toggleAll = () => {
    const nextVal = !allActiveSelected;
    const newOptions = { ...options };
    for (const c of controls) {
      if (c.count > 0) {
        newOptions[c.key] = nextVal;
      }
    }
    onChange(newOptions);
  };

  const toggleOption = (key: keyof CleaningOptions, count: number) => {
    if (count === 0) return; // Prevent toggling disabled categories
    onChange({
      ...options,
      [key]: !options[key],
    });
  };

  return (
    <div className="rounded-2xl bg-surface-container-low/70 p-4 sm:p-6 border border-surface-container-high/60 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-surface-container-high/60">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-on-surface">
            Selective Metadata Removal
          </h3>
          <p className="text-xs text-on-surface-variant">
            Choose which detected properties to sanitize
          </p>
        </div>

        {activeControls.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-mono text-xs transition-all flex items-center gap-1.5 border border-surface-container-highest font-medium"
          >
            {allActiveSelected ? <CheckSquare className="w-3.5 h-3.5 text-secondary" /> : <Square className="w-3.5 h-3.5" />}
            <span>{allActiveSelected ? 'All Selected' : 'Select All'}</span>
          </button>
        )}
      </div>

      {/* Switches Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {controls.map(item => {
          const Icon = item.icon;
          const isEnabled = item.count > 0;
          const isChecked = isEnabled && options[item.key];

          return (
            <div
              key={item.key}
              onClick={() => toggleOption(item.key, item.count)}
              className={`flex items-start justify-between p-3.5 rounded-xl transition-all border select-none ${
                !isEnabled
                  ? 'bg-surface-container-lowest/30 border-surface-container-high/30 opacity-40 cursor-not-allowed'
                  : isChecked
                  ? 'bg-surface-container-high/90 border-primary/40 shadow-sm cursor-pointer'
                  : 'bg-surface-container/40 hover:bg-surface-container/70 border-surface-container-highest/60 opacity-80 cursor-pointer'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 pr-2">
                <div className={`p-1.5 rounded-lg border flex-shrink-0 mt-0.5 ${
                  !isEnabled
                    ? 'bg-surface-container text-outline/50 border-surface-container-high/30'
                    : isChecked
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-surface-container text-outline border-surface-container-high'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs sm:text-sm font-medium ${isChecked ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                      {item.title}
                    </span>
                    {isEnabled ? (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold bg-primary-container/40 text-primary border border-primary/30">
                        {item.count} {item.count === 1 ? 'item' : 'items'}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono text-outline bg-surface-container-high border border-surface-container-highest">
                        0 detected
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-outline line-clamp-1 mt-0.5">
                    {item.subtitle}
                  </span>
                </div>
              </div>

              {/* iOS-style toggle */}
              <div className="relative flex-shrink-0 mt-0.5">
                <div className={`w-10 h-5.5 rounded-full transition-colors flex items-center p-0.5 ${
                  !isEnabled
                    ? 'bg-surface-container'
                    : isChecked
                    ? 'bg-primary'
                    : 'bg-surface-container-highest'
                }`}>
                  <div className={`w-4.5 h-4.5 rounded-full bg-on-primary shadow-md transform transition-transform duration-200 ${
                    isChecked ? 'translate-x-4.5' : 'translate-x-0'
                  }`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
