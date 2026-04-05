import React, { useEffect, useState } from 'react';
import { useToastStore, type ToastMessage, type ToastType } from './toastStore';

const styles = {
    success: 'bg-emerald-900/30 border-emerald-500 text-emerald-200',
    error: 'bg-red-900/30 border-red-500 text-red-200',
    info: 'bg-blue-900/30 border-blue-500 text-blue-200',
};

const icons = {
    success: (
      <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
        <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    )
};

const ToastItem = ({ id, type, message, endTime }: ToastMessage) => {
  const removeToast = useToastStore((state) => state.removeToast);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
    }, endTime - Date.now());
    return () => clearTimeout(timer);
  }, [endTime]);

  useEffect(() => {
    if (isExiting) {
      const timer = setTimeout(() => {
        removeToast(id);
      }, 300);
      return () => clearTimeout(timer);
    }
    return () => {};
  }, [isExiting, id, removeToast]);

  return (
    <div
      onClick={() => setIsExiting(true)}
      className={`
        flex items-center w-full max-w-sm p-4 mb-3 rounded-lg border-l-4 shadow-lg cursor-pointer
        transition-all duration-300 ease-in-out transform
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
        ${styles[type]}
      `}
      role="alert"
    >
      <div className="flex-shrink-0 mr-3">
        {icons[type]}
      </div>
      <div className="text-sm font-medium break-words">
        {message}
      </div>
    </div>
  );
};

export const ToastContainer = () => {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end pointer-events-none">
      {
}
      <div className="pointer-events-auto">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} {...toast} />
        ))}
      </div>
    </div>
  );
};

