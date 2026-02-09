import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface AnalysisCardProps {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  delay?: number;
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({ title, icon: Icon, children, delay = 0 }) => {
  return (
    <div 
      className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-primary-200 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
        <div className="p-2 bg-primary-50 rounded-lg text-primary-600 border border-primary-100">
          <Icon size={18} />
        </div>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
      </div>
      <div>
        {children}
      </div>
    </div>
  );
};