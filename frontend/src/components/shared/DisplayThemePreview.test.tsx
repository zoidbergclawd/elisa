import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DisplayThemePreview from './DisplayThemePreview';
import type { DisplayTheme } from './DisplayThemePreview';

const elisaBlue: DisplayTheme = {
  id: 'default',
  name: 'Elisa Blue',
  background_color: '#1a1a2e',
  text_color: '#ffffff',
  accent_color: '#4361ee',
  avatar_style: 'expressive',
};

const forest: DisplayTheme = {
  id: 'forest',
  name: 'Forest',
  background_color: '#1b4332',
  text_color: '#d8f3dc',
  accent_color: '#95d5b2',
  avatar_style: 'minimal',
};

const pixelTheme: DisplayTheme = {
  id: 'pixel',
  name: 'Pixel Art',
  background_color: '#0f0f0f',
  text_color: '#00ff00',
  accent_color: '#ff00ff',
  avatar_style: 'pixel',
};

describe('DisplayThemePreview', () => {
  it('renders with default props', () => {
    render(<DisplayThemePreview theme={elisaBlue} />);
    expect(screen.getByTestId('display-theme-preview')).toBeInTheDocument();
  });

  it('uses theme background color', () => {
    render(<DisplayThemePreview theme={elisaBlue} />);
    const preview = screen.getByTestId('display-theme-preview');
    expect(preview.style.backgroundColor).toBe('rgb(26, 26, 46)');
  });

  it('uses forest theme background color', () => {
    render(<DisplayThemePreview theme={forest} />);
    const preview = screen.getByTestId('display-theme-preview');
    expect(preview.style.backgroundColor).toBe('rgb(27, 67, 50)');
  });

  it('shows the agent name', () => {
    render(<DisplayThemePreview theme={elisaBlue} agentName="Buddy" />);
    expect(screen.getByTestId('preview-agent-name')).toHaveTextContent('Buddy');
  });

  it('defaults agent name to "Agent"', () => {
    render(<DisplayThemePreview theme={elisaBlue} />);
    expect(screen.getByTestId('preview-agent-name')).toHaveTextContent('Agent');
  });

  it('applies accent color to the agent name', () => {
    render(<DisplayThemePreview theme={elisaBlue} agentName="Test" />);
    const nameEl = screen.getByTestId('preview-agent-name');
    expect(nameEl.style.color).toBe('rgb(67, 97, 238)');
  });

  it('applies text color to the greeting', () => {
    render(<DisplayThemePreview theme={elisaBlue} />);
    const greeting = screen.getByTestId('preview-greeting');
    expect(greeting.style.color).toBe('rgb(255, 255, 255)');
  });

  it('shows greeting placeholder text', () => {
    render(<DisplayThemePreview theme={elisaBlue} />);
    expect(screen.getByTestId('preview-greeting')).toHaveTextContent('Hi! How can I help?');
  });

  it('shows the theme name in the status bar', () => {
    render(<DisplayThemePreview theme={elisaBlue} />);
    const statusBar = screen.getByTestId('preview-status-bar');
    expect(statusBar).toHaveTextContent('Elisa Blue');
  });

  // ── Avatar Style ───────────────────────────────────────────────

  it('shows smiley for expressive avatar style', () => {
    render(<DisplayThemePreview theme={elisaBlue} />);
    const avatar = screen.getByTestId('preview-avatar');
    expect(avatar.textContent).toBe('\u263A');
  });

  it('shows filled circle for minimal avatar style', () => {
    render(<DisplayThemePreview theme={forest} />);
    const avatar = screen.getByTestId('preview-avatar');
    expect(avatar.textContent).toBe('\u25CF');
  });

  it('shows full block for pixel avatar style', () => {
    render(<DisplayThemePreview theme={pixelTheme} />);
    const avatar = screen.getByTestId('preview-avatar');
    expect(avatar.textContent).toBe('\u2588');
  });

  // ── Size Variants ──────────────────────────────────────────────

  it('renders at small size (160x120)', () => {
    render(<DisplayThemePreview theme={elisaBlue} size="sm" />);
    const preview = screen.getByTestId('display-theme-preview');
    expect(preview.style.width).toBe('160px');
    expect(preview.style.height).toBe('120px');
  });

  it('renders at medium size (240x180) by default', () => {
    render(<DisplayThemePreview theme={elisaBlue} />);
    const preview = screen.getByTestId('display-theme-preview');
    expect(preview.style.width).toBe('240px');
    expect(preview.style.height).toBe('180px');
  });

  it('renders at large size (320x240)', () => {
    render(<DisplayThemePreview theme={elisaBlue} size="lg" />);
    const preview = screen.getByTestId('display-theme-preview');
    expect(preview.style.width).toBe('320px');
    expect(preview.style.height).toBe('240px');
  });

  // ── Theme Color Application ────────────────────────────────────

  it('applies pixel theme colors correctly', () => {
    render(<DisplayThemePreview theme={pixelTheme} />);
    const preview = screen.getByTestId('display-theme-preview');
    expect(preview.style.backgroundColor).toBe('rgb(15, 15, 15)');

    const greeting = screen.getByTestId('preview-greeting');
    expect(greeting.style.color).toBe('rgb(0, 255, 0)');

    const name = screen.getByTestId('preview-agent-name');
    expect(name.style.color).toBe('rgb(255, 0, 255)');
  });

  it('renders the avatar with accent color background', () => {
    render(<DisplayThemePreview theme={forest} />);
    const avatar = screen.getByTestId('preview-avatar');
    expect(avatar.style.backgroundColor).toBe('rgb(149, 213, 178)');
  });
});
