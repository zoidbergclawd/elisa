/** FacePreview -- Pure SVG face renderer from a FaceDescriptor. */

import type { FaceDescriptor } from '../../types';

export interface FacePreviewProps {
  face: FaceDescriptor;
  size?: number;
  state?: 'idle' | 'listening' | 'thinking' | 'speaking';
  className?: string;
}

// Eye size radius mapping
const EYE_RADIUS: Record<string, number> = { small: 8, medium: 12, large: 16 };

/** Render the base face shape. */
function renderBaseShape(shape: FaceDescriptor['base_shape'], faceColor: string) {
  switch (shape) {
    case 'round':
      return <circle cx={100} cy={100} r={80} fill={faceColor} data-testid="face-base" />;
    case 'square':
      return <rect x={20} y={20} width={160} height={160} rx={20} fill={faceColor} data-testid="face-base" />;
    case 'oval':
      return <ellipse cx={100} cy={100} rx={70} ry={85} fill={faceColor} data-testid="face-base" />;
  }
}

/** Render a single eye at given position. */
function renderEye(
  x: number,
  y: number,
  style: FaceDescriptor['eyes']['style'],
  radius: number,
  color: string,
  key: string,
) {
  switch (style) {
    case 'dots':
      return <circle key={key} cx={x} cy={y} r={radius * 0.5} fill={color} data-testid={`eye-${key}`} />;
    case 'circles':
      return (
        <g key={key} data-testid={`eye-${key}`}>
          <circle cx={x} cy={y} r={radius} fill="none" stroke={color} strokeWidth={2} />
          <circle cx={x} cy={y} r={radius * 0.4} fill={color} />
        </g>
      );
    case 'anime':
      return (
        <g key={key} data-testid={`eye-${key}`}>
          <circle cx={x} cy={y} r={radius} fill={color} />
          <circle cx={x + radius * 0.25} cy={y - radius * 0.25} r={radius * 0.3} fill="#ffffff" />
        </g>
      );
    case 'pixels':
      return (
        <g key={key} data-testid={`eye-${key}`}>
          <rect x={x - radius * 0.4} y={y - radius * 0.4} width={radius * 0.35} height={radius * 0.35} fill={color} />
          <rect x={x + radius * 0.05} y={y - radius * 0.4} width={radius * 0.35} height={radius * 0.35} fill={color} />
          <rect x={x - radius * 0.4} y={y + radius * 0.05} width={radius * 0.35} height={radius * 0.35} fill={color} />
          <rect x={x + radius * 0.05} y={y + radius * 0.05} width={radius * 0.35} height={radius * 0.35} fill={color} />
        </g>
      );
    case 'sleepy':
      return (
        <path
          key={key}
          d={`M ${x - radius} ${y} Q ${x} ${y + radius * 0.8} ${x + radius} ${y}`}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          data-testid={`eye-${key}`}
        />
      );
  }
}

/** Render the mouth at center-bottom. */
function renderMouth(style: FaceDescriptor['mouth']['style'], expression: FaceDescriptor['expression']) {
  const cx = 100;
  const cy = 130;
  const scale = expression === 'excited' ? 1.3 : 1;
  const w = 20 * scale;

  switch (style) {
    case 'line':
      return (
        <line
          x1={cx - w} y1={cy} x2={cx + w} y2={cy}
          stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
          data-testid="mouth" className="mouth-element"
        />
      );
    case 'smile':
      return (
        <path
          d={`M ${cx - w} ${cy - 4} C ${cx - w * 0.5} ${cy + 14 * scale} ${cx + w * 0.5} ${cy + 14 * scale} ${cx + w} ${cy - 4}`}
          fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
          data-testid="mouth" className="mouth-element"
        />
      );
    case 'zigzag':
      return (
        <path
          d={`M ${cx - w} ${cy} L ${cx - w * 0.5} ${cy - 5} L ${cx} ${cy + 3} L ${cx + w * 0.5} ${cy - 5} L ${cx + w} ${cy}`}
          fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          data-testid="mouth" className="mouth-element"
        />
      );
    case 'open':
      return (
        <ellipse
          cx={cx} cy={cy} rx={w * 0.6} ry={w * 0.45 * scale}
          fill="#333" stroke="currentColor" strokeWidth={2}
          data-testid="mouth" className="mouth-element"
        />
      );
    case 'cat': {
      const half = w * 0.8;
      return (
        <path
          d={`M ${cx - half} ${cy - 3} Q ${cx - half * 0.4} ${cy + 8} ${cx} ${cy - 2} Q ${cx + half * 0.4} ${cy + 8} ${cx + half} ${cy - 3}`}
          fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
          data-testid="mouth" className="mouth-element"
        />
      );
    }
  }
}

/** Apply expression modifiers to eye positions and rendering. */
function getExpressionModifiers(expression: FaceDescriptor['expression']) {
  switch (expression) {
    case 'happy':
      return { eyeTransform: 'translate(0, -2)', eyeScale: 1 };
    case 'neutral':
      return { eyeTransform: '', eyeScale: 1 };
    case 'excited':
      return { eyeTransform: '', eyeScale: 1.2 };
    case 'shy':
      return { eyeTransform: '', eyeScale: 0.85 };
    case 'cool':
      return { eyeTransform: '', eyeScale: 1 };
  }
}

export default function FacePreview({
  face,
  size = 200,
  state = 'idle',
  className = '',
}: FacePreviewProps) {
  const radius = EYE_RADIUS[face.eyes.size] ?? 12;
  const mods = getExpressionModifiers(face.expression);
  const effectiveRadius = radius * mods.eyeScale;
  const isCool = face.expression === 'cool';

  // State-based CSS class names
  const stateClass = `face-state-${state}`;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`face-preview ${stateClass} ${className}`.trim()}
      role="img"
      aria-label="Agent face preview"
      data-testid="face-preview"
    >
      {/* Inline styles for animations */}
      <defs>
        <style>{`
          .face-state-idle .eye-group {
            animation: blink 3s ease-in-out infinite;
          }
          .face-state-listening .eye-group {
            transform-origin: center;
            animation: listen-eyes 1s ease-in-out infinite alternate;
          }
          .face-state-thinking .eye-group {
            animation: think-eyes 2s ease-in-out infinite;
          }
          .face-state-speaking .mouth-element {
            animation: speak-mouth 0.4s ease-in-out infinite alternate;
          }
          @keyframes blink {
            0%, 90%, 100% { transform: scaleY(1); }
            95% { transform: scaleY(0.1); }
          }
          @keyframes listen-eyes {
            0% { transform: scale(1); }
            100% { transform: scale(1.1); }
          }
          @keyframes think-eyes {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
          @keyframes speak-mouth {
            0% { transform: scaleY(0.8); }
            100% { transform: scaleY(1.2); }
          }
        `}</style>
      </defs>

      {/* Base shape */}
      {renderBaseShape(face.base_shape, face.colors.face)}

      {/* Blush circles (always visible for cute factor) */}
      <circle cx={55} cy={110} r={12} fill={face.colors.accent} opacity={0.3} data-testid="blush-left" />
      <circle cx={145} cy={110} r={12} fill={face.colors.accent} opacity={0.3} data-testid="blush-right" />

      {/* Eyes */}
      <g className="eye-group" style={{ transformOrigin: '100px 80px' }}>
        {isCool ? (
          <>
            <line
              x1={65 - effectiveRadius} y1={80} x2={65 + effectiveRadius} y2={80}
              stroke={face.eyes.color} strokeWidth={3} strokeLinecap="round"
              data-testid="eye-left"
            />
            <line
              x1={135 - effectiveRadius} y1={80} x2={135 + effectiveRadius} y2={80}
              stroke={face.eyes.color} strokeWidth={3} strokeLinecap="round"
              data-testid="eye-right"
            />
          </>
        ) : (
          <g transform={mods.eyeTransform}>
            {renderEye(65, 80, face.eyes.style, effectiveRadius, face.eyes.color, 'left')}
            {renderEye(135, 80, face.eyes.style, effectiveRadius, face.eyes.color, 'right')}
          </g>
        )}
      </g>

      {/* Shy blush (extra blush for shy expression) */}
      {face.expression === 'shy' && (
        <>
          <circle cx={55} cy={110} r={14} fill={face.colors.accent} opacity={0.25} data-testid="shy-blush-left" />
          <circle cx={145} cy={110} r={14} fill={face.colors.accent} opacity={0.25} data-testid="shy-blush-right" />
        </>
      )}

      {/* Mouth */}
      <g style={{ transformOrigin: '100px 130px', color: face.eyes.color }}>
        {renderMouth(face.mouth.style, face.expression)}
      </g>
    </svg>
  );
}
