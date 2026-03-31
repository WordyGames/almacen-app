import React, { useEffect } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle size={20} className="text-emerald-600" />,
    error: <AlertTriangle size={20} className="text-red-600" />,
    info: <Info size={20} className="text-blue-600" />,
  };

  const colors = {
    success: 'bg-emerald-50 border-emerald-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
  };

  return (
    <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg ${colors[type]} animate-in slide-in-from-right-4 fade-in z-[999]`}>
      {icons[type]}
      <p className="text-sm font-medium text-slate-800 break-words flex-1">{message}</p>
      <button onClick={onClose} className="ml-2 text-slate-400 hover:text-slate-600 shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}
