import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ExplainItCanvas from './ExplainItCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'explain-it', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('ExplainItCanvas', () => {
  it('renders the heading text', () => {
    render(<ExplainItCanvas {...defaultProps} />);
    expect(screen.getByText('Explain-It Editor')).toBeInTheDocument();
  });

  it('renders document title input', () => {
    render(<ExplainItCanvas {...defaultProps} />);
    expect(screen.getByLabelText('Document Title')).toBeInTheDocument();
  });

  it('renders content textarea', () => {
    render(<ExplainItCanvas {...defaultProps} />);
    expect(screen.getByLabelText('Content')).toBeInTheDocument();
  });

  it('shows word count of 0 for empty content', () => {
    render(<ExplainItCanvas {...defaultProps} />);
    expect(screen.getByTestId('word-count')).toHaveTextContent('0 words');
  });

  it('updates word count as content changes', () => {
    render(<ExplainItCanvas {...defaultProps} />);
    const textarea = screen.getByLabelText('Content');
    fireEvent.change(textarea, { target: { value: 'hello world foo' } });
    expect(screen.getByTestId('word-count')).toHaveTextContent('3 words');
  });

  it('shows singular word for count of 1', () => {
    render(<ExplainItCanvas {...defaultProps} />);
    const textarea = screen.getByLabelText('Content');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(screen.getByTestId('word-count')).toHaveTextContent('1 word');
  });

  it('Save Document button is disabled when title or content is empty', () => {
    render(<ExplainItCanvas {...defaultProps} />);
    const saveBtn = screen.getByText('Save Document');
    expect(saveBtn).toBeDisabled();
  });

  it('Save Document button is enabled when both title and content are filled', () => {
    render(<ExplainItCanvas {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('Document Title'), { target: { value: 'My README' } });
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'Hello world' } });
    expect(screen.getByText('Save Document')).not.toBeDisabled();
  });

  it('Save Document calls onCanvasUpdate with document data', () => {
    const onCanvasUpdate = vi.fn();
    render(<ExplainItCanvas {...defaultProps} onCanvasUpdate={onCanvasUpdate} />);

    fireEvent.change(screen.getByLabelText('Document Title'), { target: { value: 'My README' } });
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'This is my project.' } });
    fireEvent.click(screen.getByText('Save Document'));

    expect(onCanvasUpdate).toHaveBeenCalledWith({
      type: 'document_saved',
      title: 'My README',
      content: 'This is my project.',
    });
  });

  it('does not render suggestions sidebar when there are no suggestions', () => {
    render(<ExplainItCanvas {...defaultProps} />);
    expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
  });

  it('renders suggestions sidebar when canvasState has suggestions', () => {
    const props = {
      ...defaultProps,
      canvasState: {
        type: 'explain-it',
        data: {
          suggestions: [
            { id: 's1', text: 'Add an introduction paragraph.' },
            { id: 's2', text: 'Describe the main features.' },
          ],
        },
      },
    };
    render(<ExplainItCanvas {...props} />);
    expect(screen.getByText('Suggestions')).toBeInTheDocument();
    expect(screen.getByText('Add an introduction paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Describe the main features.')).toBeInTheDocument();
  });

  it('Apply Suggestion appends suggestion text to content', () => {
    const props = {
      ...defaultProps,
      canvasState: {
        type: 'explain-it',
        data: {
          suggestions: [{ id: 's1', text: 'Suggested text here.' }],
        },
      },
    };
    render(<ExplainItCanvas {...props} />);

    // Apply the suggestion
    fireEvent.click(screen.getByLabelText('Apply suggestion: Suggested text here.'));

    const textarea = screen.getByLabelText('Content') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Suggested text here.');
  });

  it('Apply Suggestion appends with newline if content already has text', () => {
    const props = {
      ...defaultProps,
      canvasState: {
        type: 'explain-it',
        data: {
          suggestions: [{ id: 's1', text: 'More text.' }],
        },
      },
    };
    render(<ExplainItCanvas {...props} />);

    // Add existing content first
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'Existing content' } });

    // Apply the suggestion
    fireEvent.click(screen.getByLabelText('Apply suggestion: More text.'));

    const textarea = screen.getByLabelText('Content') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Existing content\nMore text.');
  });

  it('syncs title and content from canvasState.data on update', () => {
    const { rerender } = render(<ExplainItCanvas {...defaultProps} />);

    act(() => {
      rerender(
        <ExplainItCanvas
          {...defaultProps}
          canvasState={{
            type: 'explain-it',
            data: {
              title: 'Agent-Written Title',
              content: 'This document was generated by the agent.',
            },
          }}
        />,
      );
    });

    expect(screen.getByLabelText('Document Title')).toHaveValue('Agent-Written Title');
    expect(screen.getByLabelText('Content')).toHaveValue('This document was generated by the agent.');
  });
});
