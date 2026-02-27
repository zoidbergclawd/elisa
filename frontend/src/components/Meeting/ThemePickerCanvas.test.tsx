import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemePickerCanvas, { DEFAULT_THEMES } from './ThemePickerCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'theme-picker', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('ThemePickerCanvas', () => {
  it('renders all default themes', () => {
    render(<ThemePickerCanvas {...defaultProps} />);

    for (const theme of DEFAULT_THEMES) {
      expect(screen.getByLabelText(`Select ${theme.name} theme`)).toBeInTheDocument();
    }
  });

  it('renders the heading text', () => {
    render(<ThemePickerCanvas {...defaultProps} />);
    expect(screen.getByText('Pick a look for your BOX-3!')).toBeInTheDocument();
  });

  it('renders theme names below previews', () => {
    render(<ThemePickerCanvas {...defaultProps} />);

    for (const theme of DEFAULT_THEMES) {
      // Theme name appears in both the preview status bar and the label below
      const elements = screen.getAllByText(theme.name);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('clicking a theme selects it', () => {
    render(<ThemePickerCanvas {...defaultProps} />);

    const forestButton = screen.getByLabelText('Select Forest theme');
    fireEvent.click(forestButton);

    expect(forestButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Selected: Forest')).toBeInTheDocument();
  });

  it('selected theme has ring highlight class', () => {
    render(<ThemePickerCanvas {...defaultProps} />);

    const forestButton = screen.getByLabelText('Select Forest theme');
    fireEvent.click(forestButton);

    expect(forestButton.className).toContain('ring-2');
    expect(forestButton.className).toContain('ring-accent-sky');
  });

  it('unselected themes do not have ring highlight', () => {
    render(<ThemePickerCanvas {...defaultProps} />);

    const forestButton = screen.getByLabelText('Select Forest theme');
    fireEvent.click(forestButton);

    const blueButton = screen.getByLabelText('Select Elisa Blue theme');
    expect(blueButton).toHaveAttribute('aria-pressed', 'false');
    expect(blueButton.className).not.toContain('ring-2');
  });

  it('shows placeholder text when no theme is selected', () => {
    render(<ThemePickerCanvas {...defaultProps} />);
    expect(screen.getByText('Tap a theme above to see how it looks!')).toBeInTheDocument();
  });

  it('shows Apply Theme button when a theme is selected', () => {
    render(<ThemePickerCanvas {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Select Sunset theme'));
    expect(screen.getByText('Apply Theme')).toBeInTheDocument();
  });

  it('shows avatar style description for selected theme', () => {
    render(<ThemePickerCanvas {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Select Pixel Art theme'));
    expect(screen.getByText('pixel style')).toBeInTheDocument();
  });

  it('Apply Theme button calls onCanvasUpdate with theme_selected', () => {
    const onCanvasUpdate = vi.fn();
    render(<ThemePickerCanvas {...defaultProps} onCanvasUpdate={onCanvasUpdate} />);

    fireEvent.click(screen.getByLabelText('Select Forest theme'));
    fireEvent.click(screen.getByText('Apply Theme'));

    expect(onCanvasUpdate).toHaveBeenCalledWith({
      type: 'theme_selected',
      theme_id: 'forest',
    });
  });

  it('switching selection updates the selected theme info', () => {
    render(<ThemePickerCanvas {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Select Forest theme'));
    expect(screen.getByText('Selected: Forest')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Select Sunset theme'));
    expect(screen.getByText('Selected: Sunset')).toBeInTheDocument();
  });
});
