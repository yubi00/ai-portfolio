import React, { useEffect, useRef, useState } from 'react';
import { TERMINAL_COLORS } from '../config/terminal';

interface AboutOverlayProps {
  visible: boolean;
  onClose: () => void;
}

export const AboutOverlay: React.FC<AboutOverlayProps> = ({ visible, onClose }) => {
  const [mounted, setMounted] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Avoid a flash on initial load; only mount after first paint.
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < 780);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!mounted || !visible) return;
    // Move focus away from xterm so Esc works without clicking the modal first.
    window.setTimeout(() => cardRef.current?.focus(), 0);
  }, [mounted, visible]);

  if (!mounted || !visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="About"
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(980px, calc(100vw - 32px))',
          maxHeight: 'min(78vh, 760px)',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(16,16,20,0.88)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
          overflow: 'hidden',
          color: TERMINAL_COLORS.text,
          fontFamily:
            'JetBrains Mono, Fira Mono, Roboto Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          outline: 'none',
        }}
      >
        <AboutOverlayHeader onClose={onClose} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isNarrow ? '1fr' : '320px 1fr',
            gap: 16,
            padding: 16,
            overflow: 'auto',
          }}
        >
          <img
            src="/yubi-about-img.png"
            alt="About portrait"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.06)',
              filter: 'brightness(0.95) contrast(1.05)',
              alignSelf: 'start',
            }}
          />
          <div style={{ lineHeight: 1.55, fontSize: 14 }}>
            <p style={{ margin: 0, opacity: 0.95 }}>
              I build reliable backend systems and pragmatic web apps. I care about shipping
              well-tested features, keeping things observable in production, and making systems
              easy to operate.
            </p>
            <div style={{ height: 10 }} />
            <p style={{ margin: 0, opacity: 0.85 }}>
              I enjoy working across APIs, cloud infrastructure, and product-facing experiences,
              and I like collaborating closely with teams to turn ideas into something real.
            </p>
            <div style={{ height: 14 }} />
            <div style={{ opacity: 0.9 }}>
              <div style={{ fontWeight: 700, color: TERMINAL_COLORS.primary }}>Links</div>
              <div style={{ height: 8 }} />
              <div>
                <span style={{ opacity: 0.75 }}>Portfolio:</span>{' '}
                <a
                  href="https://yubikhadka.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: TERMINAL_COLORS.primary, textDecoration: 'none' }}
                >
                  yubikhadka.com
                </a>
              </div>
              <div>
                <span style={{ opacity: 0.75 }}>GitHub:</span>{' '}
                <a
                  href="https://github.com/yubi00"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: TERMINAL_COLORS.primary, textDecoration: 'none' }}
                >
                  github.com/yubi00
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AboutOverlayHeader: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Use capture because xterm may stop propagation on key events.
    window.addEventListener('keydown', onKeyDown, { capture: true });
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
      document.removeEventListener('keydown', onKeyDown, { capture: true } as any);
    };
  }, [onClose]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>About</div>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'transparent',
          color: TERMINAL_COLORS.text,
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 10,
          padding: '6px 10px',
          fontFamily: 'inherit',
          fontSize: 12,
          cursor: 'pointer',
          opacity: 0.85,
        }}
      >
        Esc
      </button>
    </div>
  );
};
