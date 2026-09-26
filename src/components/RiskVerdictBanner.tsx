import React from 'react';
import { ShieldAlert, AlertTriangle, ShieldCheck } from 'lucide-react';
import { InspectionResult } from '../lib/types';

interface RiskVerdictBannerProps {
  inspection: InspectionResult;
}

export const RiskVerdictBanner: React.FC<RiskVerdictBannerProps> = ({ inspection }) => {
  const { riskLevel, riskReason, items } = inspection;

  if (items.length === 0) {
    return (
      <div className="px-5 py-4 rounded-xl bg-primary-container/20 border border-primary/40 text-primary flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 flex-shrink-0 text-secondary" />
        <div>
          <span className="font-bold text-base block font-mono">
            Risk: LOW — Clean (0 metadata fields detected)
          </span>
          <span className="text-xs text-on-surface-variant">
            No location, author, device, or timestamp properties found in this file.
          </span>
        </div>
      </div>
    );
  }

  if (riskLevel === 'HIGH') {
    return (
      <div className="px-5 py-4 rounded-xl bg-error-container/30 border border-error/50 text-error flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 flex-shrink-0 text-error" />
        <div>
          <span className="font-bold text-base block font-mono">
            {riskReason.startsWith('Risk:') ? riskReason : `Risk: HIGH — ${riskReason}`}
          </span>
          <span className="text-xs text-on-error-container/90">
            Sensitive identifiers found. Clean this file before sharing publicly.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 flex items-center gap-3">
      <AlertTriangle className="w-6 h-6 flex-shrink-0 text-amber-400" />
      <div>
        <span className="font-bold text-base block font-mono">
          {riskReason.startsWith('Risk:') ? riskReason : `Risk: MEDIUM — ${riskReason}`}
        </span>
        <span className="text-xs text-amber-200/80">
          Technical properties and timestamps detected.
        </span>
      </div>
    </div>
  );
};
