import React from 'react';
import { RoadmapItem } from '../types';

interface RoadmapViewProps {
  steps: RoadmapItem[];
}

export const RoadmapView: React.FC<RoadmapViewProps> = ({ steps }) => {
  return (
    <div className="space-y-4 relative">
      <div className="absolute left-[15px] top-3 bottom-3 w-[2px] bg-slate-100" />
      {steps.map((step, index) => (
        <div key={index} className="relative flex gap-4 group">
          <div className="relative z-10 flex-shrink-0 mt-1">
            <div className="w-8 h-8 rounded-full bg-white border-2 border-primary-100 text-primary-600 flex items-center justify-center font-bold text-xs shadow-sm group-hover:border-primary-500 group-hover:scale-105 transition-all">
              {index + 1}
            </div>
          </div>
          <div className="flex-1 bg-slate-50 p-3.5 rounded-lg border border-slate-100 group-hover:bg-white group-hover:shadow-sm group-hover:border-slate-200 transition-all">
            <h4 className="font-semibold text-slate-900 mb-1 text-sm">{step.title}</h4>
            <p className="text-xs text-slate-500 leading-relaxed">{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
};