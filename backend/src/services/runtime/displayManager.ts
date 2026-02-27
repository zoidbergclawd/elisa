/**
 * Display manager for the BOX-3 touchscreen.
 *
 * Generates DisplayCommand sequences for the BOX-3's 2.4" IPS screen (320x240).
 * Each method produces an array of commands that the device firmware interprets
 * to render a screen. This is the TYPE SYSTEM and MANAGER layer — not the actual
 * rendering (that is firmware-side on the ESP32).
 */

import type {
  AvatarState,
  DeviceStatus,
  DisplayCommand,
  DisplayTheme,
  DisplayTurn,
} from '../../models/display.js';
import {
  DEFAULT_THEMES,
  MAX_TURN_CHARS,
  MAX_MENU_LABEL_CHARS,
  MAX_VISIBLE_TURNS,
  MAX_VISIBLE_MENU_ITEMS,
} from '../../models/display.js';

export class DisplayManager {
  private theme: DisplayTheme;

  constructor(themeId?: string) {
    this.theme = DEFAULT_THEMES.find((t) => t.id === themeId) ?? DEFAULT_THEMES[0];
  }

  /**
   * Get the current theme.
   */
  getTheme(): DisplayTheme {
    return this.theme;
  }

  /**
   * Set the display theme by ID. Falls back to default if not found.
   */
  setTheme(themeId: string): void {
    this.theme = DEFAULT_THEMES.find((t) => t.id === themeId) ?? DEFAULT_THEMES[0];
  }

  /**
   * Generate display commands for the idle/home screen.
   * Shows the agent's avatar in idle state with a greeting.
   */
  getIdleScreen(agentName: string, greeting: string): DisplayCommand[] {
    return [
      { type: 'clear' },
      { type: 'show_avatar', state: 'idle' },
      {
        type: 'show_text',
        text: this.truncateForDisplay(agentName, MAX_MENU_LABEL_CHARS),
        style: { size: 'large', align: 'center', color: this.theme.accent_color },
      },
      {
        type: 'show_text',
        text: this.truncateForDisplay(greeting, MAX_TURN_CHARS),
        style: { size: 'medium', align: 'center', color: this.theme.text_color },
      },
    ];
  }

  /**
   * Generate display commands for an active conversation.
   * Shows recent turns and the avatar in listening or speaking state.
   */
  getConversationScreen(
    agentName: string,
    turns: DisplayTurn[],
    isListening: boolean,
  ): DisplayCommand[] {
    const avatarState: AvatarState = isListening ? 'listening' : 'speaking';

    // Only show the most recent turns that fit on screen
    const visibleTurns = turns.slice(-MAX_VISIBLE_TURNS).map((turn) => ({
      ...turn,
      text: this.truncateForDisplay(turn.text, MAX_TURN_CHARS),
    }));

    return [
      { type: 'clear' },
      {
        type: 'show_text',
        text: this.truncateForDisplay(agentName, MAX_MENU_LABEL_CHARS),
        style: { size: 'small', align: 'left', color: this.theme.accent_color },
      },
      { type: 'show_conversation', turns: visibleTurns },
      { type: 'show_avatar', state: avatarState },
    ];
  }

  /**
   * Generate display commands for the thinking/processing state.
   * Shows the agent name and a "thinking" avatar animation.
   */
  getThinkingScreen(agentName: string): DisplayCommand[] {
    return [
      { type: 'clear' },
      { type: 'show_avatar', state: 'thinking' },
      {
        type: 'show_text',
        text: this.truncateForDisplay(agentName, MAX_MENU_LABEL_CHARS),
        style: { size: 'medium', align: 'center', color: this.theme.accent_color },
      },
      {
        type: 'show_text',
        text: 'Thinking...',
        style: { size: 'small', align: 'center', color: this.theme.text_color },
      },
    ];
  }

  /**
   * Generate display commands for an error state.
   * Shows error avatar and a truncated error message.
   */
  getErrorScreen(message: string): DisplayCommand[] {
    return [
      { type: 'clear' },
      { type: 'show_avatar', state: 'error' },
      {
        type: 'show_text',
        text: 'Something went wrong',
        style: { size: 'medium', align: 'center', color: this.theme.accent_color },
      },
      {
        type: 'show_text',
        text: this.truncateForDisplay(message, MAX_TURN_CHARS),
        style: { size: 'small', align: 'center', color: this.theme.text_color },
      },
    ];
  }

  /**
   * Generate display commands for a device status screen (booting, connecting, etc.).
   */
  getStatusScreen(status: DeviceStatus, details?: string): DisplayCommand[] {
    const statusLabels: Record<DeviceStatus, string> = {
      booting: 'Starting up...',
      connecting: 'Connecting...',
      ready: 'Ready!',
      offline: 'Offline',
      updating: 'Updating...',
    };

    const commands: DisplayCommand[] = [
      { type: 'clear' },
      { type: 'show_status', status },
      {
        type: 'show_text',
        text: statusLabels[status],
        style: { size: 'large', align: 'center', color: this.theme.accent_color },
      },
    ];

    if (details) {
      commands.push({
        type: 'show_text',
        text: this.truncateForDisplay(details, MAX_TURN_CHARS),
        style: { size: 'small', align: 'center', color: this.theme.text_color },
      });
    }

    return commands;
  }

  /**
   * Generate display commands for a menu screen.
   * Truncates labels and limits visible items to what fits on screen.
   */
  getMenuScreen(title: string, items: Array<{ id: string; label: string; icon?: string }>): DisplayCommand[] {
    const visibleItems = items.slice(0, MAX_VISIBLE_MENU_ITEMS).map((item) => ({
      id: item.id,
      label: this.truncateForDisplay(item.label, MAX_MENU_LABEL_CHARS),
      icon: item.icon,
    }));

    return [
      { type: 'clear' },
      {
        type: 'show_text',
        text: this.truncateForDisplay(title, MAX_MENU_LABEL_CHARS),
        style: { size: 'medium', align: 'center', color: this.theme.accent_color },
      },
      { type: 'show_menu', items: visibleItems },
    ];
  }

  /**
   * Truncate text to fit display constraints.
   * Appends an ellipsis if the text exceeds maxChars.
   */
  truncateForDisplay(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    // Reserve 1 char for the ellipsis character
    return text.slice(0, maxChars - 1) + '\u2026';
  }

  /**
   * Look up a theme by ID.
   * Returns the theme if found, undefined otherwise.
   */
  static getThemeById(themeId: string): DisplayTheme | undefined {
    return DEFAULT_THEMES.find((t) => t.id === themeId);
  }

  /**
   * Get all available themes.
   */
  static getAllThemes(): DisplayTheme[] {
    return [...DEFAULT_THEMES];
  }
}
