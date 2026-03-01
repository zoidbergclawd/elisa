import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import InterfaceDesignerCanvas from './InterfaceDesignerCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'interface-designer', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('InterfaceDesignerCanvas', () => {
  it('renders the heading text', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);
    expect(screen.getByText('Connect Your Nuggets Together')).toBeInTheDocument();
  });

  it('renders Provides and Requires columns', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);
    expect(screen.getByText('Provides')).toBeInTheDocument();
    expect(screen.getByText('Requires')).toBeInTheDocument();
    expect(screen.getByText('Connections')).toBeInTheDocument();
  });

  it('renders add interface forms for both sides', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);
    expect(screen.getByLabelText('New provide name')).toBeInTheDocument();
    expect(screen.getByLabelText('New require name')).toBeInTheDocument();
    expect(screen.getByLabelText('Add provide interface')).toBeInTheDocument();
    expect(screen.getByLabelText('Add require interface')).toBeInTheDocument();
  });

  it('adds a provide interface entry', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('New provide name'), { target: { value: 'temperature' } });
    fireEvent.click(screen.getByLabelText('Add provide interface'));

    expect(screen.getByTestId('provide-temperature')).toBeInTheDocument();
    expect(screen.getByLabelText('New provide name')).toHaveValue('');
  });

  it('adds a require interface entry', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('New require name'), { target: { value: 'sensor_data' } });
    fireEvent.click(screen.getByLabelText('Add require interface'));

    expect(screen.getByTestId('require-sensor_data')).toBeInTheDocument();
  });

  it('does not add an entry with empty name', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Add provide interface'));
    // No provide entries should be visible (the "What this nugget offers" text is always there)
    expect(screen.queryByLabelText(/Remove provide/)).not.toBeInTheDocument();
  });

  it('removes a provide entry', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('New provide name'), { target: { value: 'voltage' } });
    fireEvent.click(screen.getByLabelText('Add provide interface'));
    expect(screen.getByTestId('provide-voltage')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove provide voltage'));
    expect(screen.queryByTestId('provide-voltage')).not.toBeInTheDocument();
  });

  it('removes a require entry', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('New require name'), { target: { value: 'power' } });
    fireEvent.click(screen.getByLabelText('Add require interface'));
    expect(screen.getByTestId('require-power')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove require power'));
    expect(screen.queryByTestId('require-power')).not.toBeInTheDocument();
  });

  it('shows a connection when provide and require names match with same type', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);

    // Add matching provide and require
    fireEvent.change(screen.getByLabelText('New provide name'), { target: { value: 'temperature' } });
    fireEvent.click(screen.getByLabelText('Add provide interface'));

    fireEvent.change(screen.getByLabelText('New require name'), { target: { value: 'temperature' } });
    fireEvent.click(screen.getByLabelText('Add require interface'));

    expect(screen.getByTestId('connection-temperature')).toBeInTheDocument();
  });

  it('does not show connection when names match but types differ', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);

    // Add provide with type 'data'
    fireEvent.change(screen.getByLabelText('New provide name'), { target: { value: 'signal' } });
    fireEvent.click(screen.getByLabelText('Add provide interface'));

    // Add require with type 'event'
    fireEvent.change(screen.getByLabelText('New require name'), { target: { value: 'signal' } });
    fireEvent.change(screen.getByLabelText('New require type'), { target: { value: 'event' } });
    fireEvent.click(screen.getByLabelText('Add require interface'));

    expect(screen.queryByTestId('connection-signal')).not.toBeInTheDocument();
  });

  it('shows "No matches yet" when there are no connections', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);
    expect(screen.getByText('No matches yet')).toBeInTheDocument();
  });

  it('shows connection count after matching', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('New provide name'), { target: { value: 'data_out' } });
    fireEvent.click(screen.getByLabelText('Add provide interface'));

    fireEvent.change(screen.getByLabelText('New require name'), { target: { value: 'data_out' } });
    fireEvent.click(screen.getByLabelText('Add require interface'));

    expect(screen.getByText('1 connection matched')).toBeInTheDocument();
  });

  it('allows selecting different interface types', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('New provide type'), { target: { value: 'stream' } });
    expect(screen.getByLabelText('New provide type')).toHaveValue('stream');

    fireEvent.change(screen.getByLabelText('New require type'), { target: { value: 'function' } });
    expect(screen.getByLabelText('New require type')).toHaveValue('function');
  });

  it('Save Contracts calls onCanvasUpdate with interface data', () => {
    const onCanvasUpdate = vi.fn();
    render(<InterfaceDesignerCanvas {...defaultProps} onCanvasUpdate={onCanvasUpdate} />);

    // Add a provide
    fireEvent.change(screen.getByLabelText('New provide name'), { target: { value: 'temp' } });
    fireEvent.change(screen.getByLabelText('New provide type'), { target: { value: 'stream' } });
    fireEvent.click(screen.getByLabelText('Add provide interface'));

    // Add a matching require
    fireEvent.change(screen.getByLabelText('New require name'), { target: { value: 'temp' } });
    fireEvent.change(screen.getByLabelText('New require type'), { target: { value: 'stream' } });
    fireEvent.click(screen.getByLabelText('Add require interface'));

    fireEvent.click(screen.getByText('Save Contracts'));

    expect(onCanvasUpdate).toHaveBeenCalledWith({
      type: 'contracts_saved',
      provides: [{ name: 'temp', type: 'stream' }],
      requires: [{ name: 'temp', type: 'stream' }],
      connections: [{ name: 'temp', type: 'stream' }],
    });
  });

  it('highlights matched provide and require entries in green', () => {
    render(<InterfaceDesignerCanvas {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('New provide name'), { target: { value: 'matched' } });
    fireEvent.click(screen.getByLabelText('Add provide interface'));

    fireEvent.change(screen.getByLabelText('New require name'), { target: { value: 'matched' } });
    fireEvent.click(screen.getByLabelText('Add require interface'));

    const provideEntry = screen.getByTestId('provide-matched');
    const requireEntry = screen.getByTestId('require-matched');
    expect(provideEntry.className).toContain('bg-green-500/10');
    expect(requireEntry.className).toContain('bg-green-500/10');
  });

  it('syncs provides and requires from canvasState.data on update', () => {
    const { rerender } = render(<InterfaceDesignerCanvas {...defaultProps} />);

    act(() => {
      rerender(
        <InterfaceDesignerCanvas
          {...defaultProps}
          canvasState={{
            type: 'interface-designer',
            data: {
              provides: [{ name: 'sensor_data', type: 'stream' }],
              requires: [{ name: 'power', type: 'data' }],
            },
          }}
        />,
      );
    });

    expect(screen.getByTestId('provide-sensor_data')).toBeInTheDocument();
    expect(screen.getByTestId('require-power')).toBeInTheDocument();
  });
});
