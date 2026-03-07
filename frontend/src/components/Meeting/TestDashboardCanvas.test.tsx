import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestDashboardCanvas from './TestDashboardCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'test-dashboard', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('TestDashboardCanvas', () => {
  it('renders empty state when no tests', () => {
    render(<TestDashboardCanvas {...defaultProps} />);
    expect(screen.getByText('Waiting for test results...')).toBeInTheDocument();
  });

  it('renders pass/fail test entries', () => {
    const canvasState = {
      type: 'test-dashboard',
      data: {
        tests: [
          { name: 'test_login', status: 'passed' },
          { name: 'test_signup', status: 'failed', error: 'AssertionError: expected 200 got 500' },
        ],
      },
    };
    render(<TestDashboardCanvas {...defaultProps} canvasState={canvasState} />);
    expect(screen.getByText('test_login')).toBeInTheDocument();
    expect(screen.getByText('test_signup')).toBeInTheDocument();
    expect(screen.getByText('PASS')).toBeInTheDocument();
    expect(screen.getByText('FAIL')).toBeInTheDocument();
    expect(screen.getByText('1 passing')).toBeInTheDocument();
    expect(screen.getByText('1 failing')).toBeInTheDocument();
  });

  it('shows expected/actual for failing tests', () => {
    const canvasState = {
      type: 'test-dashboard',
      data: {
        tests: [
          { name: 'test_calc', status: 'failed', expected: '42', actual: '0' },
        ],
      },
    };
    render(<TestDashboardCanvas {...defaultProps} canvasState={canvasState} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows error stack traces', () => {
    const canvasState = {
      type: 'test-dashboard',
      data: {
        errors: [
          { task: 'Build Server', message: 'TypeError: undefined is not a function' },
        ],
      },
    };
    render(<TestDashboardCanvas {...defaultProps} canvasState={canvasState} />);
    expect(screen.getByText('Build Server')).toBeInTheDocument();
    expect(screen.getByText('TypeError: undefined is not a function')).toBeInTheDocument();
  });

  it('shows Quick Fix and Deep Fix buttons when tests are failing', () => {
    const canvasState = {
      type: 'test-dashboard',
      data: {
        tests: [{ name: 'test_a', status: 'failed' }],
      },
    };
    render(<TestDashboardCanvas {...defaultProps} canvasState={canvasState} />);
    expect(screen.getByText('Quick Fix')).toBeInTheDocument();
    expect(screen.getByText('Deep Fix')).toBeInTheDocument();
  });

  it('does not show fix buttons when all tests pass', () => {
    const canvasState = {
      type: 'test-dashboard',
      data: {
        tests: [{ name: 'test_a', status: 'passed' }],
      },
    };
    render(<TestDashboardCanvas {...defaultProps} canvasState={canvasState} />);
    expect(screen.queryByText('Quick Fix')).not.toBeInTheDocument();
    expect(screen.queryByText('Deep Fix')).not.toBeInTheDocument();
  });

  it('dispatches request_fix with strategy on button click', () => {
    const onCanvasUpdate = vi.fn();
    const canvasState = {
      type: 'test-dashboard',
      data: {
        tests: [{ name: 'test_a', status: 'failed' }],
      },
    };
    render(<TestDashboardCanvas {...defaultProps} canvasState={canvasState} onCanvasUpdate={onCanvasUpdate} />);

    fireEvent.click(screen.getByText('Quick Fix'));
    expect(onCanvasUpdate).toHaveBeenCalledWith({ type: 'request_fix', strategy: 'quick' });

    fireEvent.click(screen.getByText('Deep Fix'));
    expect(onCanvasUpdate).toHaveBeenCalledWith({ type: 'request_fix', strategy: 'deep' });
  });
});
