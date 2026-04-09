import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

interface AboutOverlayProps {
  visible: boolean;
  onClose: () => void;
}

export const AboutOverlay: React.FC<AboutOverlayProps> = ({ visible, onClose }) => {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

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
    window.setTimeout(() => cardRef.current?.focus(), 0);
  }, [mounted, visible]);

  if (!mounted || !visible) return null;

  const cardBg     = isDark ? 'rgba(16,16,20,0.92)'    : 'rgba(255,255,255,0.95)';
  const border     = isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)';
  const textColor  = isDark ? '#b0b3b8' : '#1e293b';
  const primary    = isDark ? '#93c5fd' : '#2563eb';
  const dimText    = isDark ? 0.75 : 0.55;
  const divider    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  const btnBorder  = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

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
        background: isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.20)',
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
          border,
          background: cardBg,
          backdropFilter: 'blur(12px)',
          boxShadow: isDark
            ? '0 18px 60px rgba(0,0,0,0.55)'
            : '0 8px 40px rgba(0,0,0,0.12)',
          overflow: 'hidden',
          color: textColor,
          fontFamily:
            'JetBrains Mono, Fira Mono, Roboto Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderBottom: `1px solid ${divider}`,
          }}
        >
          <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>About</div>
          <AboutCloseButton onClose={onClose} isDark={isDark} btnBorder={btnBorder} textColor={textColor} />
        </div>

        {/* Body */}
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
              border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
              filter: isDark ? 'brightness(0.95) contrast(1.05)' : 'none',
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
              <div style={{ fontWeight: 700, color: primary }}>Links</div>
              <div style={{ height: 8 }} />
              <div>
                <span style={{ opacity: dimText }}>Portfolio:</span>{' '}
                <a
                  href="https://yubikhadka.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: primary, textDecoration: 'none' }}
                >
                  yubikhadka.com
                </a>
              </div>
              <div>
                <span style={{ opacity: dimText }}>GitHub:</span>{' '}
                <a
                  href="https://github.com/yubi00"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: primary, textDecoration: 'none' }}
                >
                  github.com/yubi00
                </a>
              </div>
              <div>
                <span style={{ opacity: dimText }}>LinkedIn:</span>{' '}
                <a
                  href="https://linkedin.com/in/ubrajkhadka"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: primary, textDecoration: 'none' }}
                >
                  linkedin.com/in/ubrajkhadka
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AboutCloseButton: React.FC<{
  onClose: () => void;
  isDark: boolean;
  btnBorder: string;
  textColor: string;
}> = ({ onClose, isDark, btnBorder, textColor }) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
      document.removeEventListener('keydown', onKeyDown, { capture: true } as any);
    };
  }, [onClose]);

  return (
    <button
      type="button"
      onClick={onClose}
      style={{
        background: 'transparent',
        color: textColor,
        border: `1px solid ${btnBorder}`,
        borderRadius: 10,
        padding: '6px 10px',
        fontFamily: 'inherit',
        fontSize: 12,
        cursor: 'pointer',
        opacity: isDark ? 0.85 : 0.7,
      }}
    >
      Esc
    </button>
  );
};
