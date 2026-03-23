import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock p5 -- jsdom has no real canvas
vi.mock('p5', () => {
  class MockP5 {
    remove = vi.fn();
    constructor(sketch: Function, container: HTMLElement) {
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      const self = this as any;
      self.createCanvas = vi.fn().mockReturnValue({ style: vi.fn() });
      self.pixelDensity = vi.fn();
      self.noLoop = vi.fn();
      self.redraw = vi.fn();
      self.width = 640;
      self.height = 360;
      self.background = vi.fn();
      self.fill = vi.fn();
      self.noStroke = vi.fn();
      self.stroke = vi.fn();
      self.strokeWeight = vi.fn();
      self.ellipse = vi.fn();
      self.rect = vi.fn();
      self.text = vi.fn();
      self.textSize = vi.fn();
      self.textAlign = vi.fn();
      self.textStyle = vi.fn();
      self.textWidth = vi.fn().mockReturnValue(50);
      self.push = vi.fn();
      self.pop = vi.fn();
      self.CENTER = 'center';
      self.LEFT = 'left';
      self.TOP = 'top';
      self.BOLD = 'bold';
      self.NORMAL = 'normal';
      self.drawingContext = { shadowBlur: 0, shadowColor: '' };
      try { sketch(self); } catch { /* noop */ }
    }
  }
  return { default: MockP5 };
});

import DesignPreviewCanvas from './DesignPreviewCanvas';
import { getCanvas } from './canvasRegistry';

beforeEach(() => {
  vi.clearAllMocks();
});

const baseProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'design-preview', data: {} as Record<string, unknown> },
  onCanvasUpdate: vi.fn(),
};

describe('DesignPreviewCanvas', () => {
  it('renders the heading', () => {
    render(<DesignPreviewCanvas {...baseProps} />);
    expect(screen.getByText('Design Preview')).toBeTruthy();
  });

  it('shows empty state when no data', () => {
    render(<DesignPreviewCanvas {...baseProps} />);
    expect(screen.getAllByText('Start chatting -- the preview updates as you talk!').length).toBeGreaterThan(0);
  });

  it('renders scene canvas with elements', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Starfield',
          description: 'A scrolling starfield with twinkling stars',
          background: '#0a0a2e',
          elements: [
            { name: 'Stars', description: 'Twinkling dots', color: '#ffffff' },
          ],
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(screen.getByTestId('scene-canvas')).toBeTruthy();
    expect(screen.getByText('Stars')).toBeTruthy();
    expect(screen.getByText('Twinkling dots')).toBeTruthy();
  });

  it('renders color palette swatches', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Test',
          palette: ['#ffffff', '#4361ee', '#ff6b6b'],
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(screen.getByTestId('color-palette')).toBeTruthy();
    expect(screen.getByText('#ffffff')).toBeTruthy();
    expect(screen.getByText('#4361ee')).toBeTruthy();
    expect(screen.getByText('#ff6b6b')).toBeTruthy();
  });

  it('renders design elements with color swatch', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Test',
          elements: [
            { name: 'Twinkling Stars', description: 'Small white dots that blink', color: '#ffffff' },
            { name: 'Nebula', description: 'Colorful cloud of gas' },
          ],
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(screen.getByTestId('design-elements')).toBeTruthy();
    expect(screen.getByText('Twinkling Stars')).toBeTruthy();
    expect(screen.getByText('Small white dots that blink')).toBeTruthy();
    expect(screen.getByText('Nebula')).toBeTruthy();
  });

  it('elements without draw render without crash', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Test',
          background: '#000',
          elements: [
            { name: 'NoDraw', description: 'Element without draw code' },
          ],
        },
      },
    };
    const { container } = render(<DesignPreviewCanvas {...props} />);
    expect(container).toBeTruthy();
    expect(screen.getByTestId('scene-canvas')).toBeTruthy();
  });

  it('invalid draw code does not crash', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Test',
          background: '#000',
          elements: [
            { name: 'BadCode', description: 'Has bad draw', draw: 'throw new Error("boom")' },
          ],
        },
      },
    };
    const { container } = render(<DesignPreviewCanvas {...props} />);
    expect(container).toBeTruthy();
    expect(screen.getByTestId('scene-canvas')).toBeTruthy();
  });

  it('backward compat: elements with only name/description still render', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Compat',
          elements: [
            { name: 'OldElement', description: 'No color or draw field' },
          ],
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(screen.getByText('OldElement')).toBeTruthy();
    expect(screen.getByText('No color or draw field')).toBeTruthy();
    expect(screen.getByTestId('scene-canvas')).toBeTruthy();
  });

  it('is registered in the canvas registry', () => {
    const canvas = getCanvas('design-preview');
    expect(canvas).toBeTruthy();
  });

  it('renders save button and calls onMaterialize', async () => {
    const onMaterialize = vi.fn().mockResolvedValue({ files: ['test.json'], primaryFile: 'test.json' });
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: { scene_title: 'Test', description: 'A test scene' },
      },
      onMaterialize,
    };
    render(<DesignPreviewCanvas {...props} />);
    const saveBtn = screen.getByText('Save Design Spec');
    fireEvent.click(saveBtn);
    expect(onMaterialize).toHaveBeenCalledWith(props.canvasState.data);
    expect(await screen.findByText('Saved!')).toBeTruthy();
  });
});
