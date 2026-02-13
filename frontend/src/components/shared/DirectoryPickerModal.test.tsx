import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DirectoryPickerModal from './DirectoryPickerModal';

describe('DirectoryPickerModal', () => {
  it('renders title and input', () => {
    render(<DirectoryPickerModal onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Choose Project Folder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Projects/)).toBeInTheDocument();
  });

  it('calls onSelect with trimmed path on submit', () => {
    const onSelect = vi.fn();
    render(<DirectoryPickerModal onSelect={onSelect} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Projects/);
    fireEvent.change(input, { target: { value: '  /home/user/myproject  ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSelect).toHaveBeenCalledWith('/home/user/myproject');
  });

  it('does not call onSelect when input is empty', () => {
    const onSelect = vi.fn();
    render(<DirectoryPickerModal onSelect={onSelect} onCancel={vi.fn()} />);
    fireEvent.submit(screen.getByPlaceholderText(/Projects/).closest('form')!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<DirectoryPickerModal onSelect={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn();
    render(<DirectoryPickerModal onSelect={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('Select button is disabled when input is empty', () => {
    render(<DirectoryPickerModal onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Select')).toBeDisabled();
  });

  it('Select button is enabled when input has text', () => {
    render(<DirectoryPickerModal onSelect={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Projects/), { target: { value: '/tmp/test' } });
    expect(screen.getByText('Select')).not.toBeDisabled();
  });
});
