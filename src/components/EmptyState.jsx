import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({
  title = 'Sin resultados',
  description = 'No encontramos elementos para mostrar.',
  className = '',
}) {
  return (
    <div className={`rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 sm:p-8 text-center ${className}`}>
      <Inbox size={28} className="mx-auto mb-2 text-slate-400" />
      <p className="text-sm sm:text-base font-semibold text-slate-700 break-words">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </div>
  );
}
