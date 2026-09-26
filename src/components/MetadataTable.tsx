import React from 'react';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { InspectionResult } from '../lib/types';

interface MetadataTableProps {
  inspection: InspectionResult;
}

export const MetadataTable: React.FC<MetadataTableProps> = ({ inspection }) => {
  const { items } = inspection;

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-container-low/70 p-6 border border-surface-container-high/60 flex flex-col items-center justify-center text-center gap-2">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-secondary mb-1">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-base text-on-surface">
          0 Metadata Fields Detected
        </h3>
        <p className="text-xs text-on-surface-variant max-w-md">
          This file is completely clean. No location coordinates, author names, device identifiers, or timestamps found.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface-container-low/70 p-5 sm:p-6 border border-surface-container-high/60 flex flex-col gap-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-surface-container-high/60">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <h3 className="font-semibold text-base text-on-surface">
            Detected Metadata Exposure (<span className="text-red-400 font-mono font-bold">{items.length}</span>)
          </h3>
        </div>
      </div>

      {/* 2-Column Simple Table with RED high-contrast exposure highlights */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-surface-container-high/80 text-outline uppercase font-mono text-[11px]">
              <th className="py-2.5 px-3 font-medium w-1/3">Property</th>
              <th className="py-2.5 px-3 font-medium w-2/3">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-red-900/30 font-mono text-xs">
            {items.map((item) => (
              <tr
                key={item.id}
                className="bg-red-950/20 hover:bg-red-950/40 transition-colors"
              >
                <td className="py-2.5 px-3 font-semibold text-red-400 align-top">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
                    <span>{item.name}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-red-300 break-all select-all font-mono font-medium">
                  <span className="px-2 py-1 rounded bg-red-950/40 border border-red-500/30 text-red-300 inline-block max-w-full">
                    {item.value}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
