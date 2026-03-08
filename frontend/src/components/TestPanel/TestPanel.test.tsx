import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestList from './TestList';
import AddTestForm from './AddTestForm';
import type { TestResult } from '../../types';

describe('TestList', () => {
  it('shows empty state when no tests', () => {
    render(<TestList testResults={[]} />);
    expect(screen.getByText('No tests yet. Tests will appear here during the build.')).toBeInTheDocument();
  });

  it('renders passing tests with green checkmark', () => {
    const results: TestResult[] = [
      { test_name: 'test_add', passed: true, details: 'PASSED' },
    ];
    const { container } = render(<TestList testResults={results} />);
    expect(screen.getByText('test_add')).toBeInTheDocument();
    expect(container.querySelector('.text-accent-mint')).toBeInTheDocument();
  });

  it('renders failing tests with red X', () => {
    const results: TestResult[] = [
      { test_name: 'test_bad', passed: false, details: 'expected 4 got 5' },
    ];
    const { container } = render(<TestList testResults={results} />);
    expect(screen.getByText('test_bad')).toBeInTheDocument();
    expect(container.querySelector('.text-accent-coral')).toBeInTheDocument();
  });

  it('shows expandable error detail for failures', () => {
    const results: TestResult[] = [
      { test_name: 'test_broken', passed: false, details: 'expected 4 got 5' },
    ];
    render(<TestList testResults={results} />);

    // Error detail hidden initially
    expect(screen.queryByText('expected 4 got 5')).not.toBeInTheDocument();

    // Expand
    fireEvent.click(screen.getByText('test_broken'));
    expect(screen.getByText('expected 4 got 5')).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByText('test_broken'));
    expect(screen.queryByText('expected 4 got 5')).not.toBeInTheDocument();
  });

  it('renders both passing and failing tests together', () => {
    const results: TestResult[] = [
      { test_name: 'test_pass', passed: true, details: 'PASSED' },
      { test_name: 'test_fail', passed: false, details: 'error' },
    ];
    render(<TestList testResults={results} />);
    expect(screen.getByText('test_pass')).toBeInTheDocument();
    expect(screen.getByText('test_fail')).toBeInTheDocument();
  });

  it('renders pending tests with grey dot icon', () => {
    const results: TestResult[] = [
      { test_name: 'test_pending_check', passed: false, details: 'Button is clickable', status: 'pending' },
    ];
    render(<TestList testResults={results} />);
    expect(screen.getByText('test_pending_check')).toBeInTheDocument();
    // Should show grey dot, not checkmark or X
    expect(screen.getByTestId('pending-icon')).toBeInTheDocument();
  });

  it('renders pending tests with muted text style', () => {
    const results: TestResult[] = [
      { test_name: 'test_pending_style', passed: false, details: 'desc', status: 'pending' },
    ];
    const { container } = render(<TestList testResults={results} />);
    // Should NOT have green or red icons
    expect(container.querySelector('.text-accent-mint')).not.toBeInTheDocument();
    expect(container.querySelector('.text-accent-coral')).not.toBeInTheDocument();
  });

  it('pending tests are not expandable', () => {
    const results: TestResult[] = [
      { test_name: 'test_pending_no_expand', passed: false, details: 'some detail', status: 'pending' },
    ];
    render(<TestList testResults={results} />);
    // Click should not expand details since status is pending
    fireEvent.click(screen.getByText('test_pending_no_expand'));
    // The expand arrow should not be present
    expect(screen.queryByText('\u25b8')).not.toBeInTheDocument();
  });

  it('mixes pending, passing, and failing tests correctly', () => {
    const results: TestResult[] = [
      { test_name: 'test_done_pass', passed: true, details: 'PASSED', status: 'passed' },
      { test_name: 'test_done_fail', passed: false, details: 'error msg', status: 'failed' },
      { test_name: 'test_waiting', passed: false, details: 'Will run', status: 'pending' },
    ];
    const { container } = render(<TestList testResults={results} />);
    expect(screen.getByText('test_done_pass')).toBeInTheDocument();
    expect(screen.getByText('test_done_fail')).toBeInTheDocument();
    expect(screen.getByText('test_waiting')).toBeInTheDocument();
    // Should have all three icon types
    expect(container.querySelector('.text-accent-mint')).toBeInTheDocument();
    expect(container.querySelector('.text-accent-coral')).toBeInTheDocument();
    expect(screen.getByTestId('pending-icon')).toBeInTheDocument();
  });
});

describe('AddTestForm', () => {
  it('submits with both fields filled', () => {
    const onAddTest = vi.fn();
    render(<AddTestForm onAddTest={onAddTest} />);

    fireEvent.change(screen.getByPlaceholderText('When [trigger] happens...'), { target: { value: 'button clicked' } });
    fireEvent.change(screen.getByPlaceholderText('[action] should happen...'), { target: { value: 'counter increments' } });
    fireEvent.click(screen.getByText('Add Test'));

    expect(onAddTest).toHaveBeenCalledWith('button clicked', 'counter increments');
  });

  it('clears inputs after submit', () => {
    const onAddTest = vi.fn();
    render(<AddTestForm onAddTest={onAddTest} />);

    const whenInput = screen.getByPlaceholderText('When [trigger] happens...') as HTMLInputElement;
    const thenInput = screen.getByPlaceholderText('[action] should happen...') as HTMLInputElement;

    fireEvent.change(whenInput, { target: { value: 'button clicked' } });
    fireEvent.change(thenInput, { target: { value: 'counter increments' } });
    fireEvent.click(screen.getByText('Add Test'));

    expect(whenInput.value).toBe('');
    expect(thenInput.value).toBe('');
  });

  it('does not submit with empty when field', () => {
    const onAddTest = vi.fn();
    render(<AddTestForm onAddTest={onAddTest} />);

    fireEvent.change(screen.getByPlaceholderText('[action] should happen...'), { target: { value: 'something' } });
    fireEvent.click(screen.getByText('Add Test'));

    expect(onAddTest).not.toHaveBeenCalled();
  });

  it('does not submit with empty then field', () => {
    const onAddTest = vi.fn();
    render(<AddTestForm onAddTest={onAddTest} />);

    fireEvent.change(screen.getByPlaceholderText('When [trigger] happens...'), { target: { value: 'something' } });
    fireEvent.click(screen.getByText('Add Test'));

    expect(onAddTest).not.toHaveBeenCalled();
  });

  it('does not submit with whitespace-only fields', () => {
    const onAddTest = vi.fn();
    render(<AddTestForm onAddTest={onAddTest} />);

    fireEvent.change(screen.getByPlaceholderText('When [trigger] happens...'), { target: { value: '   ' } });
    fireEvent.change(screen.getByPlaceholderText('[action] should happen...'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Add Test'));

    expect(onAddTest).not.toHaveBeenCalled();
  });
});
