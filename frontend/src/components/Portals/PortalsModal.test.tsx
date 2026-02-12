import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PortalsModal from './PortalsModal';
import type { Portal } from './types';

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });
});

const samplePortal: Portal = {
  id: 'portal-1',
  name: 'Test Board',
  description: 'A test ESP32 board for unit testing',
  mechanism: 'serial',
  status: 'unconfigured',
  capabilities: [
    { id: 'c1', name: 'LED', kind: 'action', description: 'Control LED' },
    { id: 'c2', name: 'Temp', kind: 'query', description: 'Read temp' },
  ],
  serialConfig: { baudRate: 115200 },
};

const mcpPortal: Portal = {
  id: 'portal-2',
  name: 'FS Server',
  description: 'File system MCP server',
  mechanism: 'mcp',
  status: 'unconfigured',
  capabilities: [],
  mcpConfig: { command: 'npx', args: ['-y', 'pkg'] },
};

describe('PortalsModal', () => {
  // -- Rendering ------------------------------------------------------------
  it('renders modal with title', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Portals')).toBeDefined();
  });

  it('shows empty state message when no portals', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/No portals yet/)).toBeDefined();
  });

  it('lists existing portals', () => {
    render(<PortalsModal portals={[samplePortal]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Test Board')).toBeDefined();
  });

  it('shows mechanism label for each portal', () => {
    render(<PortalsModal portals={[samplePortal]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Serial / USB')).toBeDefined();
  });

  // -- Close ----------------------------------------------------------------
  it('calls onClose when X button clicked', () => {
    const onClose = vi.fn();
    render(<PortalsModal portals={[]} onPortalsChange={onClose} onClose={onClose} />);
    fireEvent.click(screen.getByText('X'));
    expect(onClose).toHaveBeenCalled();
  });

  // -- Editor ---------------------------------------------------------------
  it('opens editor for new portal', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('+ New Portal'));
    expect(screen.getByText('Name')).toBeDefined();
    expect(screen.getByText('Mechanism')).toBeDefined();
  });

  it('opens editor when Edit clicked', () => {
    render(<PortalsModal portals={[samplePortal]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Test Board')).toBeDefined();
  });

  // -- Delete ---------------------------------------------------------------
  it('deletes a portal from list view', () => {
    const onChange = vi.fn();
    render(<PortalsModal portals={[samplePortal, mcpPortal]} onPortalsChange={onChange} onClose={vi.fn()} />);
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);
    expect(onChange).toHaveBeenCalledWith([mcpPortal]);
  });

  // -- Save -----------------------------------------------------------------
  it('saves a new portal', () => {
    const onChange = vi.fn();
    render(<PortalsModal portals={[]} onPortalsChange={onChange} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('+ New Portal'));
    const nameInput = screen.getByPlaceholderText('e.g. My ESP32 Board');
    fireEvent.change(nameInput, { target: { value: 'New Portal' } });
    fireEvent.click(screen.getByText('Done'));
    expect(onChange).toHaveBeenCalled();
    const saved = onChange.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('New Portal');
  });

  it('updates an existing portal', () => {
    const onChange = vi.fn();
    render(<PortalsModal portals={[samplePortal]} onPortalsChange={onChange} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    const nameInput = screen.getByDisplayValue('Test Board');
    fireEvent.change(nameInput, { target: { value: 'Updated Board' } });
    fireEvent.click(screen.getByText('Done'));
    expect(onChange).toHaveBeenCalled();
    const saved = onChange.mock.calls[0][0];
    expect(saved[0].name).toBe('Updated Board');
  });

  // -- Templates ------------------------------------------------------------
  it('shows templates view', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('From Template'));
    expect(screen.getByText('ESP32 Board')).toBeDefined();
    expect(screen.getByText('LoRa Radio')).toBeDefined();
    expect(screen.getByText('File System')).toBeDefined();
  });

  it('navigates back from templates', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('From Template'));
    fireEvent.click(screen.getByText(/Back to list/));
    expect(screen.getByText('+ New Portal')).toBeDefined();
  });

  it('selects a template and opens editor', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('From Template'));
    fireEvent.click(screen.getByText('ESP32 Board'));
    expect(screen.getByDisplayValue('ESP32 Board')).toBeDefined();
  });

  // -- Mechanism-specific config fields --------------------------------------
  it('shows serial config fields when mechanism is serial', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('+ New Portal'));
    const mechanismSelect = screen.getByDisplayValue('Auto-detect');
    fireEvent.change(mechanismSelect, { target: { value: 'serial' } });
    expect(screen.getByText('Serial Port')).toBeDefined();
    expect(screen.getByText('Baud Rate')).toBeDefined();
  });

  it('shows MCP config fields when mechanism is mcp', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('+ New Portal'));
    const mechanismSelect = screen.getByDisplayValue('Auto-detect');
    fireEvent.change(mechanismSelect, { target: { value: 'mcp' } });
    expect(screen.getByText('Command')).toBeDefined();
    expect(screen.getByText('Arguments')).toBeDefined();
  });

  it('shows CLI config fields when mechanism is cli', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('+ New Portal'));
    const mechanismSelect = screen.getByDisplayValue('Auto-detect');
    fireEvent.change(mechanismSelect, { target: { value: 'cli' } });
    expect(screen.getByText('Command')).toBeDefined();
  });

  // -- Capabilities ---------------------------------------------------------
  it('shows capability list in editor', () => {
    render(<PortalsModal portals={[samplePortal]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('LED')).toBeDefined();
    expect(screen.getByText('Temp')).toBeDefined();
    expect(screen.getByText('Capabilities')).toBeDefined();
  });

  // -- Done button state ----------------------------------------------------
  it('disables Done when name is empty', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('+ New Portal'));
    const doneBtn = screen.getByText('Done');
    expect((doneBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Done when name is filled', () => {
    render(<PortalsModal portals={[]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('+ New Portal'));
    const nameInput = screen.getByPlaceholderText('e.g. My ESP32 Board');
    fireEvent.change(nameInput, { target: { value: 'Something' } });
    const doneBtn = screen.getByText('Done');
    expect((doneBtn as HTMLButtonElement).disabled).toBe(false);
  });

  // -- Cancel ---------------------------------------------------------------
  it('cancels editor and returns to list', () => {
    render(<PortalsModal portals={[samplePortal]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('+ New Portal')).toBeDefined();
  });

  // -- Capability count in list (DOM text split) ----------------------------
  it('shows capability count in list view', () => {
    const { container } = render(
      <PortalsModal portals={[samplePortal]} onPortalsChange={vi.fn()} onClose={vi.fn()} />
    );
    const subtextEl = container.querySelector('.text-xs.text-atelier-text-muted.mt-1');
    expect(subtextEl).toBeTruthy();
    expect(subtextEl!.textContent).toContain('2 capabilit');
  });

  // -- Description truncation in list ---------------------------------------
  it('truncates long descriptions in list view', () => {
    const longPortal: Portal = {
      ...samplePortal,
      description: 'A'.repeat(100),
    };
    const { container } = render(
      <PortalsModal portals={[longPortal]} onPortalsChange={vi.fn()} onClose={vi.fn()} />
    );
    const subtextEl = container.querySelector('.text-xs.text-atelier-text-muted.mt-1');
    expect(subtextEl!.textContent).toContain('...');
  });

  // -- Unnamed portal display -----------------------------------------------
  it('shows (unnamed) for portal with no name', () => {
    const unnamed: Portal = { ...samplePortal, name: '' };
    render(<PortalsModal portals={[unnamed]} onPortalsChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('(unnamed)')).toBeDefined();
  });

  // -- Delete from editor ---------------------------------------------------
  it('deletes from editor view', () => {
    const onChange = vi.fn();
    render(<PortalsModal portals={[samplePortal]} onPortalsChange={onChange} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
