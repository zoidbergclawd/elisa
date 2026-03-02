import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LaunchPadCanvas, { LAYOUT_TEMPLATES } from './LaunchPadCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'launch-pad', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('LaunchPadCanvas', () => {
  it('renders the heading text', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    expect(screen.getByText('Launch Pad')).toBeInTheDocument();
  });

  it('renders all layout templates', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    for (const t of LAYOUT_TEMPLATES) {
      expect(screen.getByLabelText(`Select ${t.name} template`)).toBeInTheDocument();
    }
  });

  it('renders template descriptions', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    for (const t of LAYOUT_TEMPLATES) {
      expect(screen.getByText(t.description)).toBeInTheDocument();
    }
  });

  it('clicking a template selects it', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    const btn = screen.getByLabelText('Select Hero + Features template');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('selected template has ring highlight', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    const btn = screen.getByLabelText('Select Hero + Features template');
    fireEvent.click(btn);
    expect(btn.className).toContain('ring-2');
    expect(btn.className).toContain('ring-accent-sky');
  });

  it('unselected templates do not have ring highlight', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Select Hero + Features template'));
    const other = screen.getByLabelText('Select Centered Minimal template');
    expect(other).toHaveAttribute('aria-pressed', 'false');
    expect(other.className).not.toContain('ring-2');
  });

  it('renders customization inputs', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    expect(screen.getByLabelText('Project Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Tagline')).toBeInTheDocument();
    expect(screen.getByLabelText('Primary color picker')).toBeInTheDocument();
    expect(screen.getByLabelText('Accent color picker')).toBeInTheDocument();
  });

  it('shows placeholder when no template is selected', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    expect(screen.getByText('Select a template to see a preview')).toBeInTheDocument();
  });

  it('shows preview when a template is selected', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Select Hero + Features template'));
    // Preview should show default project name
    expect(screen.getByText('My Project')).toBeInTheDocument();
  });

  it('preview updates with project name input', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Select Centered Minimal template'));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'Space Game' } });
    expect(screen.getByText('Space Game')).toBeInTheDocument();
  });

  it('preview updates with tagline input', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Select Centered Minimal template'));
    fireEvent.change(screen.getByLabelText('Tagline'), { target: { value: 'Explore the cosmos!' } });
    expect(screen.getByText('Explore the cosmos!')).toBeInTheDocument();
  });

  it('Finalize button is disabled when no template is selected', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    expect(screen.getByText('Finalize')).toBeDisabled();
  });

  it('Finalize button is disabled when template selected but no project name', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Select Hero + Features template'));
    expect(screen.getByText('Finalize')).toBeDisabled();
  });

  it('Finalize button is enabled when template and project name are set', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Select Hero + Features template'));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'My Game' } });
    expect(screen.getByText('Finalize')).not.toBeDisabled();
  });

  it('Finalize calls onCanvasUpdate with configuration', () => {
    const onCanvasUpdate = vi.fn();
    render(<LaunchPadCanvas {...defaultProps} onCanvasUpdate={onCanvasUpdate} />);

    fireEvent.click(screen.getByLabelText('Select Full Banner template'));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'Cool App' } });
    fireEvent.change(screen.getByLabelText('Tagline'), { target: { value: 'Very cool' } });
    fireEvent.click(screen.getByText('Finalize'));

    expect(onCanvasUpdate).toHaveBeenCalledWith({
      type: 'launch_page_finalized',
      template: 'full-banner',
      headline: 'Cool App',
      description: 'Very cool',
      primary_color: '#4361ee',
      accent_color: '#ff6b6b',
    });
  });

  it('switching templates updates the preview', () => {
    render(<LaunchPadCanvas {...defaultProps} />);

    // Select hero first
    fireEvent.click(screen.getByLabelText('Select Hero + Features template'));
    expect(screen.getByText('Get Started')).toBeInTheDocument();

    // Switch to centered minimal
    fireEvent.click(screen.getByLabelText('Select Centered Minimal template'));
    expect(screen.getByText('Launch')).toBeInTheDocument();
    expect(screen.queryByText('Get Started')).not.toBeInTheDocument();
  });

  it('renders split-image-text template preview', () => {
    render(<LaunchPadCanvas {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Select Split Image + Text template'));
    expect(screen.getByText('[img]')).toBeInTheDocument();
    expect(screen.getByText('Try It')).toBeInTheDocument();
  });

  it('has 4 layout templates', () => {
    expect(LAYOUT_TEMPLATES).toHaveLength(4);
  });

  it('syncs form fields from canvasState.data on update', () => {
    const initialProps = {
      ...defaultProps,
      canvasState: { type: 'launch-pad', data: {} },
    };
    const { rerender } = render(<LaunchPadCanvas {...initialProps} />);

    // Re-render with agent-provided canvasState data
    act(() => {
      rerender(
        <LaunchPadCanvas
          {...initialProps}
          canvasState={{
            type: 'launch-pad',
            data: {
              template: 'centered-minimal',
              headline: 'Agent Project',
              description: 'Built by AI',
              primary_color: '#ff0000',
              accent_color: '#00ff00',
            },
          }}
        />,
      );
    });

    // Verify form fields updated
    expect(screen.getByLabelText('Select Centered Minimal template')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Project Name')).toHaveValue('Agent Project');
    expect(screen.getByLabelText('Tagline')).toHaveValue('Built by AI');
    // Preview should now show the agent's project name
    expect(screen.getByText('Agent Project')).toBeInTheDocument();
  });
});
