import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SingleSelectWidget from './SingleSelectWidget';
import type { QuestionOption } from '../../../types';

const options: QuestionOption[] = [
  { label: 'A website', value: 'website' },
  { label: 'A game', value: 'game' },
  { label: 'A chatbot', value: 'chatbot' },
];

describe('SingleSelectWidget', () => {
  it('renders the question text', () => {
    render(
      <SingleSelectWidget question="What do you want to build?" options={options} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('What do you want to build?')).toBeInTheDocument();
  });

  it('renders all option buttons', () => {
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('A website')).toBeInTheDocument();
    expect(screen.getByText('A game')).toBeInTheDocument();
    expect(screen.getByText('A chatbot')).toBeInTheDocument();
  });

  it('renders "Something else" fallback button', () => {
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('Something else')).toBeInTheDocument();
  });

  it('calls onSelect with the value when an option is clicked', () => {
    const onSelect = vi.fn();
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('A game'));
    expect(onSelect).toHaveBeenCalledWith('game');
  });

  it('highlights the selected option', () => {
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={vi.fn()} />,
    );
    const btn = screen.getByText('A website');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows text input when "Something else" is clicked', () => {
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Something else'));
    expect(screen.getByLabelText('Custom answer')).toBeInTheDocument();
  });

  it('submits custom text on Send click', () => {
    const onSelect = vi.fn();
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('Something else'));
    const input = screen.getByLabelText('Custom answer');
    fireEvent.change(input, { target: { value: 'A robot' } });
    fireEvent.click(screen.getByText('Send'));
    expect(onSelect).toHaveBeenCalledWith('A robot');
  });

  it('submits custom text on Enter key', () => {
    const onSelect = vi.fn();
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('Something else'));
    const input = screen.getByLabelText('Custom answer');
    fireEvent.change(input, { target: { value: 'A spaceship' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('A spaceship');
  });

  it('disables Send button when custom text is empty', () => {
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Something else'));
    expect(screen.getByText('Send')).toBeDisabled();
  });

  it('does not submit when custom text is only whitespace', () => {
    const onSelect = vi.fn();
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('Something else'));
    const input = screen.getByLabelText('Custom answer');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Send'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('has group role with question as label', () => {
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('group', { name: 'Pick one' })).toBeInTheDocument();
  });

  it('hides text input when a regular option is selected after "Something else"', () => {
    render(
      <SingleSelectWidget question="Pick one" options={options} onSelect={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Something else'));
    expect(screen.getByLabelText('Custom answer')).toBeInTheDocument();
    fireEvent.click(screen.getByText('A game'));
    expect(screen.queryByLabelText('Custom answer')).not.toBeInTheDocument();
  });
});
