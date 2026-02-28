import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FacePreview from './FacePreview';
import type { FaceDescriptor } from '../../types';

const defaultFace: FaceDescriptor = {
  base_shape: 'round',
  eyes: { style: 'circles', size: 'medium', color: '#4361ee' },
  mouth: { style: 'smile' },
  expression: 'happy',
  colors: { face: '#f0f0f0', accent: '#ffb3ba' },
};

describe('FacePreview', () => {
  it('renders with default face', () => {
    render(<FacePreview face={defaultFace} />);
    expect(screen.getByTestId('face-preview')).toBeInTheDocument();
    expect(screen.getByTestId('face-base')).toBeInTheDocument();
    expect(screen.getByTestId('mouth')).toBeInTheDocument();
  });

  it('renders correct aria label', () => {
    render(<FacePreview face={defaultFace} />);
    expect(screen.getByRole('img', { name: 'Agent face preview' })).toBeInTheDocument();
  });

  it('applies custom size', () => {
    render(<FacePreview face={defaultFace} size={300} />);
    const svg = screen.getByTestId('face-preview');
    expect(svg.getAttribute('width')).toBe('300');
    expect(svg.getAttribute('height')).toBe('300');
  });

  it('applies default size of 200', () => {
    render(<FacePreview face={defaultFace} />);
    const svg = screen.getByTestId('face-preview');
    expect(svg.getAttribute('width')).toBe('200');
    expect(svg.getAttribute('height')).toBe('200');
  });

  it('applies className', () => {
    render(<FacePreview face={defaultFace} className="my-class" />);
    const svg = screen.getByTestId('face-preview');
    expect(svg.className.baseVal).toContain('my-class');
  });

  // Base shapes
  it('renders round base shape as circle', () => {
    render(<FacePreview face={{ ...defaultFace, base_shape: 'round' }} />);
    const base = screen.getByTestId('face-base');
    expect(base.tagName).toBe('circle');
  });

  it('renders square base shape as rect', () => {
    render(<FacePreview face={{ ...defaultFace, base_shape: 'square' }} />);
    const base = screen.getByTestId('face-base');
    expect(base.tagName).toBe('rect');
  });

  it('renders oval base shape as ellipse', () => {
    render(<FacePreview face={{ ...defaultFace, base_shape: 'oval' }} />);
    const base = screen.getByTestId('face-base');
    expect(base.tagName).toBe('ellipse');
  });

  // Eye styles
  it('renders dots eyes', () => {
    const face: FaceDescriptor = {
      ...defaultFace,
      eyes: { style: 'dots', size: 'medium', color: '#000' },
    };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('eye-left')).toBeInTheDocument();
    expect(screen.getByTestId('eye-right')).toBeInTheDocument();
  });

  it('renders circles eyes', () => {
    const face: FaceDescriptor = {
      ...defaultFace,
      eyes: { style: 'circles', size: 'medium', color: '#000' },
    };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('eye-left')).toBeInTheDocument();
    expect(screen.getByTestId('eye-right')).toBeInTheDocument();
  });

  it('renders anime eyes', () => {
    const face: FaceDescriptor = {
      ...defaultFace,
      eyes: { style: 'anime', size: 'large', color: '#000' },
    };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('eye-left')).toBeInTheDocument();
    expect(screen.getByTestId('eye-right')).toBeInTheDocument();
  });

  it('renders pixels eyes', () => {
    const face: FaceDescriptor = {
      ...defaultFace,
      eyes: { style: 'pixels', size: 'small', color: '#000' },
    };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('eye-left')).toBeInTheDocument();
    expect(screen.getByTestId('eye-right')).toBeInTheDocument();
  });

  it('renders sleepy eyes', () => {
    const face: FaceDescriptor = {
      ...defaultFace,
      eyes: { style: 'sleepy', size: 'medium', color: '#000' },
    };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('eye-left')).toBeInTheDocument();
    expect(screen.getByTestId('eye-right')).toBeInTheDocument();
  });

  // Mouth styles
  it('renders line mouth', () => {
    const face: FaceDescriptor = { ...defaultFace, mouth: { style: 'line' } };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('mouth')).toBeInTheDocument();
  });

  it('renders smile mouth', () => {
    const face: FaceDescriptor = { ...defaultFace, mouth: { style: 'smile' } };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('mouth')).toBeInTheDocument();
  });

  it('renders zigzag mouth', () => {
    const face: FaceDescriptor = { ...defaultFace, mouth: { style: 'zigzag' } };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('mouth')).toBeInTheDocument();
  });

  it('renders open mouth', () => {
    const face: FaceDescriptor = { ...defaultFace, mouth: { style: 'open' } };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('mouth')).toBeInTheDocument();
  });

  it('renders cat mouth', () => {
    const face: FaceDescriptor = { ...defaultFace, mouth: { style: 'cat' } };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('mouth')).toBeInTheDocument();
  });

  // Blush circles always present
  it('renders blush circles', () => {
    render(<FacePreview face={defaultFace} />);
    expect(screen.getByTestId('blush-left')).toBeInTheDocument();
    expect(screen.getByTestId('blush-right')).toBeInTheDocument();
  });

  // Shy expression adds extra blush
  it('renders extra blush for shy expression', () => {
    const face: FaceDescriptor = { ...defaultFace, expression: 'shy' };
    render(<FacePreview face={face} />);
    expect(screen.getByTestId('shy-blush-left')).toBeInTheDocument();
    expect(screen.getByTestId('shy-blush-right')).toBeInTheDocument();
  });

  it('does not render extra blush for non-shy expressions', () => {
    render(<FacePreview face={defaultFace} />);
    expect(screen.queryByTestId('shy-blush-left')).not.toBeInTheDocument();
  });

  // Cool expression renders horizontal line eyes
  it('renders horizontal line eyes for cool expression', () => {
    const face: FaceDescriptor = { ...defaultFace, expression: 'cool' };
    render(<FacePreview face={face} />);
    const leftEye = screen.getByTestId('eye-left');
    const rightEye = screen.getByTestId('eye-right');
    expect(leftEye.tagName).toBe('line');
    expect(rightEye.tagName).toBe('line');
  });

  // State classes
  it('applies idle state class by default', () => {
    render(<FacePreview face={defaultFace} />);
    const svg = screen.getByTestId('face-preview');
    expect(svg.className.baseVal).toContain('face-state-idle');
  });

  it('applies listening state class', () => {
    render(<FacePreview face={defaultFace} state="listening" />);
    const svg = screen.getByTestId('face-preview');
    expect(svg.className.baseVal).toContain('face-state-listening');
  });

  it('applies thinking state class', () => {
    render(<FacePreview face={defaultFace} state="thinking" />);
    const svg = screen.getByTestId('face-preview');
    expect(svg.className.baseVal).toContain('face-state-thinking');
  });

  it('applies speaking state class', () => {
    render(<FacePreview face={defaultFace} state="speaking" />);
    const svg = screen.getByTestId('face-preview');
    expect(svg.className.baseVal).toContain('face-state-speaking');
  });

  // Face color applied
  it('applies face color to base shape', () => {
    render(<FacePreview face={defaultFace} />);
    const base = screen.getByTestId('face-base');
    expect(base.getAttribute('fill')).toBe('#f0f0f0');
  });

  // Accent color applied to blush
  it('applies accent color to blush circles', () => {
    render(<FacePreview face={defaultFace} />);
    const blush = screen.getByTestId('blush-left');
    expect(blush.getAttribute('fill')).toBe('#ffb3ba');
  });

  // All expression variants render without error
  it.each(['happy', 'neutral', 'excited', 'shy', 'cool'] as const)(
    'renders %s expression without error',
    (expression) => {
      const face: FaceDescriptor = { ...defaultFace, expression };
      render(<FacePreview face={face} />);
      expect(screen.getByTestId('face-preview')).toBeInTheDocument();
    },
  );

  // All combinations of base_shape + eyes + mouth render
  it('renders all base shapes with all eye styles', () => {
    const shapes: FaceDescriptor['base_shape'][] = ['round', 'square', 'oval'];
    const eyeStyles: FaceDescriptor['eyes']['style'][] = ['dots', 'circles', 'anime', 'pixels', 'sleepy'];

    for (const shape of shapes) {
      for (const eyeStyle of eyeStyles) {
        const face: FaceDescriptor = {
          ...defaultFace,
          base_shape: shape,
          eyes: { style: eyeStyle, size: 'medium', color: '#000' },
        };
        const { unmount } = render(<FacePreview face={face} />);
        expect(screen.getByTestId('face-preview')).toBeInTheDocument();
        unmount();
      }
    }
  });
});
