import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CampaignCanvas, { COLOR_PALETTES } from './CampaignCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'campaign', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('CampaignCanvas', () => {
  it('renders the heading text', () => {
    render(<CampaignCanvas {...defaultProps} />);
    expect(screen.getByText('What makes your project exciting?')).toBeInTheDocument();
  });

  it('renders all three tabs', () => {
    render(<CampaignCanvas {...defaultProps} />);
    expect(screen.getByRole('tab', { name: 'Poster' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Social Card' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Storyboard' })).toBeInTheDocument();
  });

  it('starts on the Poster tab', () => {
    render(<CampaignCanvas {...defaultProps} />);
    expect(screen.getByRole('tab', { name: 'Poster' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Poster title')).toBeInTheDocument();
  });

  it('switches to Social Card tab', () => {
    render(<CampaignCanvas {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Social Card' }));

    expect(screen.getByRole('tab', { name: 'Social Card' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Social card headline')).toBeInTheDocument();
  });

  it('switches to Storyboard tab', () => {
    render(<CampaignCanvas {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Storyboard' }));

    expect(screen.getByRole('tab', { name: 'Storyboard' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Storyboard panel 1')).toBeInTheDocument();
  });

  it('renders all color palettes on Poster tab', () => {
    render(<CampaignCanvas {...defaultProps} />);
    for (const palette of COLOR_PALETTES) {
      expect(screen.getByLabelText(`Select ${palette.name} palette`)).toBeInTheDocument();
    }
  });

  it('selecting a palette marks it as pressed', () => {
    render(<CampaignCanvas {...defaultProps} />);
    const btn = screen.getByLabelText('Select Cool Blues palette');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows poster preview when title is entered', () => {
    render(<CampaignCanvas {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('Poster title'), { target: { value: 'My Project' } });
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('shows social card preview when headline is entered', () => {
    render(<CampaignCanvas {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Social Card' }));
    fireEvent.change(screen.getByLabelText('Social card headline'), { target: { value: 'Check this out!' } });
    expect(screen.getByText('Check this out!')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('renders 4 storyboard panels', () => {
    render(<CampaignCanvas {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Storyboard' }));
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByLabelText(`Storyboard panel ${i}`)).toBeInTheDocument();
    }
  });

  it('Save Assets calls onCanvasUpdate with all data', () => {
    const onCanvasUpdate = vi.fn();
    render(<CampaignCanvas {...defaultProps} onCanvasUpdate={onCanvasUpdate} />);

    // Fill poster
    fireEvent.change(screen.getByLabelText('Poster title'), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText('Poster subtitle'), { target: { value: 'Sub' } });
    fireEvent.click(screen.getByLabelText('Select Bright & Bold palette'));

    // Save
    fireEvent.click(screen.getByText('Save Assets'));

    expect(onCanvasUpdate).toHaveBeenCalledWith({
      type: 'assets_saved',
      poster: { title: 'Title', subtitle: 'Sub', palette: 'bright' },
      socialCard: { headline: '', description: '', cta: '' },
      storyboard: [{ scene: '' }, { scene: '' }, { scene: '' }, { scene: '' }],
    });
  });

  it('storyboard panel text is editable', () => {
    render(<CampaignCanvas {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Storyboard' }));

    const panel = screen.getByLabelText('Storyboard panel 1');
    fireEvent.change(panel, { target: { value: 'Hero appears' } });
    expect(panel).toHaveValue('Hero appears');
  });

  it('CTA text renders in social card preview', () => {
    render(<CampaignCanvas {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Social Card' }));
    fireEvent.change(screen.getByLabelText('Social card headline'), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText('Call-to-action text'), { target: { value: 'Try Me' } });
    expect(screen.getByText('Try Me')).toBeInTheDocument();
  });
});
