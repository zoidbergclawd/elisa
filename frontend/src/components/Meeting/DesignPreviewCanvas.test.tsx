import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DesignPreviewCanvas from './DesignPreviewCanvas';
import { getCanvas } from './canvasRegistry';

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

  it('renders scene preview with title and description', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Starfield',
          description: 'A scrolling starfield with twinkling stars',
          background: '#0a0a2e',
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(screen.getByText('Starfield')).toBeTruthy();
    expect(screen.getByText('A scrolling starfield with twinkling stars')).toBeTruthy();
    const scenePreview = screen.getByTestId('scene-preview');
    expect(scenePreview.style.background).toBe('rgb(10, 10, 46)');
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

  it('renders design elements', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Test',
          elements: [
            { name: 'Twinkling Stars', description: 'Small white dots that blink' },
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
    // Wait for status to update
    expect(await screen.findByText('Saved!')).toBeTruthy();
  });
});
