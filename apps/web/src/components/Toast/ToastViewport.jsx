/* eslint-disable no-unused-vars */
import React from 'react';
import { useToastStore } from '../../stores/toastStore.js';

const TONE_STYLES = {
  info: {
    accent: 'var(--signal-info)',
    bg: 'rgba(24, 31, 42, 0.96)',
  },
  success: {
    accent: 'var(--signal-success)',
    bg: 'rgba(16, 27, 21, 0.96)',
  },
  warning: {
    accent: 'var(--signal-warn)',
    bg: 'rgba(38, 30, 18, 0.96)',
  },
  error: {
    accent: 'var(--signal-danger)',
    bg: 'rgba(42, 20, 20, 0.96)',
  },
};

export default function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  if (!toasts.length) return null;

  return (
    <div className="toast-viewport">
      {toasts.map((toast) => {
        const tone = TONE_STYLES[toast.tone] || TONE_STYLES.info;
        return (
          <div
            key={toast.id}
            className="brutalist-toast"
            style={{
              background: tone.bg,
              borderColor: tone.accent,
              boxShadow: `8px 8px 0 rgba(0, 0, 0, 0.65)`,
            }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <strong style={{ color: tone.accent, fontSize: 12, letterSpacing: '0.08em' }}>
                {toast.title}
              </strong>
              {toast.description ? (
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {toast.description}
                </span>
              ) : null}
            </div>

            <button className="brutalist-icon-button" onClick={() => removeToast(toast.id)}>
              Close
            </button>
          </div>
        );
      })}
    </div>
  );
}
