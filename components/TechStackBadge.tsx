import React from 'react';

interface TechStackBadgeProps {
  tech: string;
}

export const TechStackBadge: React.FC<TechStackBadgeProps> = ({ tech }) => {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white text-slate-700 border border-slate-200 shadow-sm hover:border-primary-300 hover:text-primary-700 transition-colors cursor-default select-none">
      {tech}
    </span>
  );
};