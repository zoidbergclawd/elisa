import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentStudioCanvas, {
  DEFAULT_FACE,
  FACE_COLORS,
  EYE_COLORS,
  ACCENT_COLORS,
  THEME_OPTIONS,
} from './AgentStudioCanvas';
import { getRegisteredCanvasTypes } from './canvasRegistry';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'agent-studio', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('AgentStudioCanvas', () => {
  it('renders the canvas', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByTestId('agent-studio-canvas')).toBeInTheDocument();
  });

  it('renders the heading', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByText("Design Your Agent's Face!")).toBeInTheDocument();
  });

  it('renders shape selectors', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByLabelText('Select Round shape')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Square shape')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Oval shape')).toBeInTheDocument();
  });

  it('renders eye style selectors', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByLabelText('Select Dots eyes')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Circles eyes')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Anime eyes')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Pixels eyes')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Sleepy eyes')).toBeInTheDocument();
  });

  it('renders eye size selectors', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByLabelText('Select S eye size')).toBeInTheDocument();
    expect(screen.getByLabelText('Select M eye size')).toBeInTheDocument();
    expect(screen.getByLabelText('Select L eye size')).toBeInTheDocument();
  });

  it('renders mouth style selectors', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByLabelText('Select Line mouth')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Smile mouth')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Zigzag mouth')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Open mouth')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Cat mouth')).toBeInTheDocument();
  });

  it('renders expression selectors', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByLabelText('Select Happy expression')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Neutral expression')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Excited expression')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Shy expression')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Cool expression')).toBeInTheDocument();
  });

  it('renders face color swatches', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    for (const c of FACE_COLORS) {
      expect(screen.getByLabelText(`Face color ${c}`)).toBeInTheDocument();
    }
  });

  it('renders eye color swatches', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    for (const c of EYE_COLORS) {
      expect(screen.getByLabelText(`Eye color ${c}`)).toBeInTheDocument();
    }
  });

  it('renders accent color swatches', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    for (const c of ACCENT_COLORS) {
      expect(screen.getByLabelText(`Accent color ${c}`)).toBeInTheDocument();
    }
  });

  it('renders theme selectors', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    for (const theme of THEME_OPTIONS) {
      expect(screen.getByLabelText(`Select ${theme.name} theme`)).toBeInTheDocument();
    }
  });

  it('renders the agent name input', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByLabelText('Agent name')).toBeInTheDocument();
  });

  it('renders the live preview', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByTestId('face-preview')).toBeInTheDocument();
  });

  it('renders the Save Agent Look button', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByText('Save Agent Look')).toBeInTheDocument();
  });

  // Interactive tests
  it('clicking a shape selects it and updates preview', () => {
    render(<AgentStudioCanvas {...defaultProps} />);

    const squareBtn = screen.getByLabelText('Select Square shape');
    fireEvent.click(squareBtn);
    expect(squareBtn).toHaveAttribute('aria-pressed', 'true');

    // Preview should now show a rect (square base)
    const base = screen.getByTestId('face-base');
    expect(base.tagName).toBe('rect');
  });

  it('clicking an eye style updates preview', () => {
    render(<AgentStudioCanvas {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Select Dots eyes'));
    // Eye style changed -- eyes should still render
    expect(screen.getByTestId('eye-left')).toBeInTheDocument();
    expect(screen.getByTestId('eye-right')).toBeInTheDocument();
  });

  it('clicking a mouth style updates preview', () => {
    render(<AgentStudioCanvas {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Select Zigzag mouth'));
    expect(screen.getByTestId('mouth')).toBeInTheDocument();
  });

  it('clicking an expression updates preview', () => {
    render(<AgentStudioCanvas {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Select Cool expression'));
    // Cool expression turns eyes into horizontal lines
    const leftEye = screen.getByTestId('eye-left');
    expect(leftEye.tagName).toBe('line');
  });

  it('clicking a face color swatch selects it', () => {
    render(<AgentStudioCanvas {...defaultProps} />);

    const swatch = screen.getByLabelText('Face color #ffeb3b');
    fireEvent.click(swatch);
    expect(swatch).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking an eye color swatch selects it', () => {
    render(<AgentStudioCanvas {...defaultProps} />);

    const swatch = screen.getByLabelText('Eye color #2e7d32');
    fireEvent.click(swatch);
    expect(swatch).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking an accent color swatch selects it', () => {
    render(<AgentStudioCanvas {...defaultProps} />);

    const swatch = screen.getByLabelText('Accent color #bae1ff');
    fireEvent.click(swatch);
    expect(swatch).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a theme selects it', () => {
    render(<AgentStudioCanvas {...defaultProps} />);

    const themeBtn = screen.getByLabelText('Select Forest theme');
    fireEvent.click(themeBtn);
    expect(themeBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('typing in agent name updates the footer text', () => {
    render(<AgentStudioCanvas {...defaultProps} />);

    const input = screen.getByLabelText('Agent name');
    fireEvent.change(input, { target: { value: 'Sparky' } });
    expect(screen.getByText('Creating Sparky...')).toBeInTheDocument();
  });

  it('shows placeholder text when no agent name is set', () => {
    render(<AgentStudioCanvas {...defaultProps} />);
    expect(screen.getByText('Give your agent a name to get started!')).toBeInTheDocument();
  });

  it('Save Agent Look calls onCanvasUpdate with face, theme, and agent_name', () => {
    const onCanvasUpdate = vi.fn();
    render(<AgentStudioCanvas {...defaultProps} onCanvasUpdate={onCanvasUpdate} />);

    // Set agent name
    fireEvent.change(screen.getByLabelText('Agent name'), { target: { value: 'Buddy' } });

    // Select a theme
    fireEvent.click(screen.getByLabelText('Select Space theme'));

    // Click save
    fireEvent.click(screen.getByText('Save Agent Look'));

    expect(onCanvasUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent_studio_saved',
        face: expect.objectContaining({ base_shape: 'round' }),
        theme: 'space',
        agent_name: 'Buddy',
      }),
    );
  });

  it('Save Agent Look emits the current face state after changes', () => {
    const onCanvasUpdate = vi.fn();
    render(<AgentStudioCanvas {...defaultProps} onCanvasUpdate={onCanvasUpdate} />);

    // Change shape to square
    fireEvent.click(screen.getByLabelText('Select Square shape'));
    // Change eyes to anime
    fireEvent.click(screen.getByLabelText('Select Anime eyes'));
    // Change mouth to cat
    fireEvent.click(screen.getByLabelText('Select Cat mouth'));

    fireEvent.click(screen.getByText('Save Agent Look'));

    const call = onCanvasUpdate.mock.calls[0][0];
    expect(call.face.base_shape).toBe('square');
    expect(call.face.eyes.style).toBe('anime');
    expect(call.face.mouth.style).toBe('cat');
  });

  // Default face matches backend
  it('DEFAULT_FACE has expected values', () => {
    expect(DEFAULT_FACE.base_shape).toBe('round');
    expect(DEFAULT_FACE.eyes.style).toBe('circles');
    expect(DEFAULT_FACE.eyes.size).toBe('medium');
    expect(DEFAULT_FACE.eyes.color).toBe('#4361ee');
    expect(DEFAULT_FACE.mouth.style).toBe('smile');
    expect(DEFAULT_FACE.expression).toBe('happy');
    expect(DEFAULT_FACE.colors.face).toBe('#f0f0f0');
    expect(DEFAULT_FACE.colors.accent).toBe('#ffb3ba');
  });

  // Palette lengths
  it('has 8 face colors', () => {
    expect(FACE_COLORS).toHaveLength(8);
  });

  it('has 8 eye colors', () => {
    expect(EYE_COLORS).toHaveLength(8);
  });

  it('has 8 accent colors', () => {
    expect(ACCENT_COLORS).toHaveLength(8);
  });

  it('has 8 theme options', () => {
    expect(THEME_OPTIONS).toHaveLength(8);
  });

  // Canvas registry
  it('agent-studio canvas type is registered', () => {
    const types = getRegisteredCanvasTypes();
    expect(types).toContain('agent-studio');
  });

  // Deselection behavior -- selecting a different option deselects the old one
  it('selecting a new shape deselects the old one', () => {
    render(<AgentStudioCanvas {...defaultProps} />);

    const roundBtn = screen.getByLabelText('Select Round shape');
    const squareBtn = screen.getByLabelText('Select Square shape');

    // Round is selected by default
    expect(roundBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(squareBtn);
    expect(squareBtn).toHaveAttribute('aria-pressed', 'true');
    expect(roundBtn).toHaveAttribute('aria-pressed', 'false');
  });
});
