import { describe, it, expect, beforeEach } from 'vitest';
import { DisplayManager } from '../../services/runtime/displayManager.js';
import {
  DEFAULT_THEMES,
  MAX_TURN_CHARS,
  MAX_MENU_LABEL_CHARS,
  MAX_VISIBLE_TURNS,
  MAX_VISIBLE_MENU_ITEMS,
} from '../../models/display.js';
import type { DisplayCommand, DisplayTurn } from '../../models/display.js';

describe('DisplayManager', () => {
  let dm: DisplayManager;

  beforeEach(() => {
    dm = new DisplayManager();
  });

  // ── Theme Management ─────────────────────────────────────────────

  describe('theme management', () => {
    it('defaults to the first theme (Elisa Blue)', () => {
      expect(dm.getTheme().id).toBe('default');
      expect(dm.getTheme().name).toBe('Elisa Blue');
    });

    it('accepts a theme ID in constructor', () => {
      const forestDm = new DisplayManager('forest');
      expect(forestDm.getTheme().id).toBe('forest');
      expect(forestDm.getTheme().name).toBe('Forest');
    });

    it('falls back to default for unknown theme ID in constructor', () => {
      const unknownDm = new DisplayManager('nonexistent');
      expect(unknownDm.getTheme().id).toBe('default');
    });

    it('setTheme switches the active theme', () => {
      dm.setTheme('sunset');
      expect(dm.getTheme().id).toBe('sunset');
      expect(dm.getTheme().accent_color).toBe('#ff6b6b');
    });

    it('setTheme falls back to default for unknown ID', () => {
      dm.setTheme('sunset');
      dm.setTheme('nonexistent');
      expect(dm.getTheme().id).toBe('default');
    });

    it('getThemeById returns the correct theme', () => {
      const theme = DisplayManager.getThemeById('pixel');
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('Pixel Art');
      expect(theme!.avatar_style).toBe('pixel');
    });

    it('getThemeById returns undefined for unknown ID', () => {
      expect(DisplayManager.getThemeById('unknown')).toBeUndefined();
    });

    it('getAllThemes returns all predefined themes', () => {
      const themes = DisplayManager.getAllThemes();
      expect(themes).toHaveLength(DEFAULT_THEMES.length);
      expect(themes.map((t) => t.id)).toEqual([
        'default', 'forest', 'sunset', 'pixel',
        'space', 'nature', 'tech', 'candy', 'plain',
      ]);
    });

    it('getAllThemes returns a copy (not the original array)', () => {
      const themes = DisplayManager.getAllThemes();
      themes.pop();
      expect(DisplayManager.getAllThemes()).toHaveLength(DEFAULT_THEMES.length);
    });

    // PRD-002 themes
    it('includes Space theme with correct colors', () => {
      const theme = DisplayManager.getThemeById('space');
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('Space');
      expect(theme!.background_color).toBe('#0a0a2e');
      expect(theme!.accent_color).toBe('#7b68ee');
      expect(theme!.avatar_style).toBe('expressive');
    });

    it('includes Nature theme with correct colors', () => {
      const theme = DisplayManager.getThemeById('nature');
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('Nature');
      expect(theme!.background_color).toBe('#1a4d1a');
      expect(theme!.accent_color).toBe('#4caf50');
    });

    it('includes Tech theme with correct colors', () => {
      const theme = DisplayManager.getThemeById('tech');
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('Tech');
      expect(theme!.background_color).toBe('#0d1b2a');
      expect(theme!.accent_color).toBe('#00bcd4');
      expect(theme!.avatar_style).toBe('minimal');
    });

    it('includes Candy theme with correct colors', () => {
      const theme = DisplayManager.getThemeById('candy');
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('Candy');
      expect(theme!.background_color).toBe('#fff0f5');
      expect(theme!.accent_color).toBe('#ff69b4');
    });

    it('includes Plain theme with correct colors', () => {
      const theme = DisplayManager.getThemeById('plain');
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('Plain');
      expect(theme!.background_color).toBe('#ffffff');
      expect(theme!.text_color).toBe('#333333');
      expect(theme!.avatar_style).toBe('minimal');
    });

    it('can construct DisplayManager with each PRD theme', () => {
      for (const id of ['space', 'nature', 'tech', 'candy', 'plain']) {
        const manager = new DisplayManager(id);
        expect(manager.getTheme().id).toBe(id);
      }
    });
  });

  // ── Text Truncation ──────────────────────────────────────────────

  describe('truncateForDisplay', () => {
    it('returns text unchanged if within limit', () => {
      expect(dm.truncateForDisplay('hello', 10)).toBe('hello');
    });

    it('returns text unchanged if exactly at limit', () => {
      expect(dm.truncateForDisplay('12345', 5)).toBe('12345');
    });

    it('truncates with ellipsis when text exceeds limit', () => {
      const result = dm.truncateForDisplay('hello world this is too long', 10);
      expect(result).toHaveLength(10);
      expect(result.endsWith('\u2026')).toBe(true);
      expect(result).toBe('hello wor\u2026');
    });

    it('handles single-character limit', () => {
      const result = dm.truncateForDisplay('hello', 1);
      expect(result).toBe('\u2026');
    });

    it('handles empty string', () => {
      expect(dm.truncateForDisplay('', 10)).toBe('');
    });
  });

  // ── Idle Screen ──────────────────────────────────────────────────

  describe('getIdleScreen', () => {
    it('starts with a clear command', () => {
      const commands = dm.getIdleScreen('Buddy', 'Hi there!');
      expect(commands[0]).toEqual({ type: 'clear' });
    });

    it('shows the avatar in idle state', () => {
      const commands = dm.getIdleScreen('Buddy', 'Hi there!');
      expect(commands[1]).toEqual({ type: 'show_avatar', state: 'idle' });
    });

    it('shows the agent name with accent color', () => {
      const commands = dm.getIdleScreen('Buddy', 'Hi there!');
      const nameCmd = commands[2];
      expect(nameCmd.type).toBe('show_text');
      if (nameCmd.type === 'show_text') {
        expect(nameCmd.text).toBe('Buddy');
        expect(nameCmd.style?.size).toBe('large');
        expect(nameCmd.style?.align).toBe('center');
        expect(nameCmd.style?.color).toBe(dm.getTheme().accent_color);
      }
    });

    it('shows the greeting with text color', () => {
      const commands = dm.getIdleScreen('Buddy', 'Hi there!');
      const greetCmd = commands[3];
      expect(greetCmd.type).toBe('show_text');
      if (greetCmd.type === 'show_text') {
        expect(greetCmd.text).toBe('Hi there!');
        expect(greetCmd.style?.size).toBe('medium');
        expect(greetCmd.style?.color).toBe(dm.getTheme().text_color);
      }
    });

    it('truncates a long agent name', () => {
      const commands = dm.getIdleScreen('A Very Long Agent Name That Is Too Long', 'Hi!');
      const nameCmd = commands[2];
      if (nameCmd.type === 'show_text') {
        expect(nameCmd.text.length).toBeLessThanOrEqual(MAX_MENU_LABEL_CHARS);
      }
    });

    it('truncates a long greeting', () => {
      const longGreeting = 'x'.repeat(150);
      const commands = dm.getIdleScreen('Buddy', longGreeting);
      const greetCmd = commands[3];
      if (greetCmd.type === 'show_text') {
        expect(greetCmd.text.length).toBeLessThanOrEqual(MAX_TURN_CHARS);
      }
    });

    it('uses theme colors', () => {
      const forestDm = new DisplayManager('forest');
      const commands = forestDm.getIdleScreen('Buddy', 'Hi!');
      const nameCmd = commands[2];
      if (nameCmd.type === 'show_text') {
        expect(nameCmd.style?.color).toBe('#95d5b2');
      }
    });
  });

  // ── Conversation Screen ──────────────────────────────────────────

  describe('getConversationScreen', () => {
    const baseTurns: DisplayTurn[] = [
      { role: 'user', text: 'Hello!', timestamp: 1000 },
      { role: 'agent', text: 'Hi! How can I help?', timestamp: 2000 },
    ];

    it('starts with a clear command', () => {
      const commands = dm.getConversationScreen('Buddy', baseTurns, false);
      expect(commands[0]).toEqual({ type: 'clear' });
    });

    it('shows agent name at the top', () => {
      const commands = dm.getConversationScreen('Buddy', baseTurns, false);
      const nameCmd = commands[1];
      expect(nameCmd.type).toBe('show_text');
      if (nameCmd.type === 'show_text') {
        expect(nameCmd.text).toBe('Buddy');
        expect(nameCmd.style?.size).toBe('small');
        expect(nameCmd.style?.align).toBe('left');
      }
    });

    it('includes conversation turns', () => {
      const commands = dm.getConversationScreen('Buddy', baseTurns, false);
      const convCmd = commands[2];
      expect(convCmd.type).toBe('show_conversation');
      if (convCmd.type === 'show_conversation') {
        expect(convCmd.turns).toHaveLength(2);
        expect(convCmd.turns[0].role).toBe('user');
        expect(convCmd.turns[1].role).toBe('agent');
      }
    });

    it('shows listening avatar when isListening is true', () => {
      const commands = dm.getConversationScreen('Buddy', baseTurns, true);
      expect(commands[3]).toEqual({ type: 'show_avatar', state: 'listening' });
    });

    it('shows speaking avatar when isListening is false', () => {
      const commands = dm.getConversationScreen('Buddy', baseTurns, false);
      expect(commands[3]).toEqual({ type: 'show_avatar', state: 'speaking' });
    });

    it('limits visible turns to MAX_VISIBLE_TURNS', () => {
      const manyTurns: DisplayTurn[] = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('agent' as const),
        text: `Turn ${i}`,
        timestamp: i * 1000,
      }));

      const commands = dm.getConversationScreen('Buddy', manyTurns, false);
      const convCmd = commands[2];
      if (convCmd.type === 'show_conversation') {
        expect(convCmd.turns).toHaveLength(MAX_VISIBLE_TURNS);
        // Should show the most recent turns
        expect(convCmd.turns[0].text).toBe('Turn 6');
        expect(convCmd.turns[3].text).toBe('Turn 9');
      }
    });

    it('truncates long turn text', () => {
      const longTurns: DisplayTurn[] = [
        { role: 'user', text: 'x'.repeat(200), timestamp: 1000 },
      ];

      const commands = dm.getConversationScreen('Buddy', longTurns, false);
      const convCmd = commands[2];
      if (convCmd.type === 'show_conversation') {
        expect(convCmd.turns[0].text.length).toBeLessThanOrEqual(MAX_TURN_CHARS);
      }
    });

    it('handles empty turns array', () => {
      const commands = dm.getConversationScreen('Buddy', [], false);
      const convCmd = commands[2];
      if (convCmd.type === 'show_conversation') {
        expect(convCmd.turns).toHaveLength(0);
      }
    });
  });

  // ── Thinking Screen ──────────────────────────────────────────────

  describe('getThinkingScreen', () => {
    it('starts with clear and shows thinking avatar', () => {
      const commands = dm.getThinkingScreen('Buddy');
      expect(commands[0]).toEqual({ type: 'clear' });
      expect(commands[1]).toEqual({ type: 'show_avatar', state: 'thinking' });
    });

    it('shows the agent name', () => {
      const commands = dm.getThinkingScreen('Buddy');
      const nameCmd = commands[2];
      if (nameCmd.type === 'show_text') {
        expect(nameCmd.text).toBe('Buddy');
      }
    });

    it('shows "Thinking..." text', () => {
      const commands = dm.getThinkingScreen('Buddy');
      const thinkCmd = commands[3];
      if (thinkCmd.type === 'show_text') {
        expect(thinkCmd.text).toBe('Thinking...');
      }
    });
  });

  // ── Error Screen ─────────────────────────────────────────────────

  describe('getErrorScreen', () => {
    it('shows error avatar', () => {
      const commands = dm.getErrorScreen('Connection lost');
      expect(commands[0]).toEqual({ type: 'clear' });
      expect(commands[1]).toEqual({ type: 'show_avatar', state: 'error' });
    });

    it('shows error heading', () => {
      const commands = dm.getErrorScreen('Connection lost');
      const headingCmd = commands[2];
      if (headingCmd.type === 'show_text') {
        expect(headingCmd.text).toBe('Something went wrong');
      }
    });

    it('shows the error message', () => {
      const commands = dm.getErrorScreen('Connection lost');
      const msgCmd = commands[3];
      if (msgCmd.type === 'show_text') {
        expect(msgCmd.text).toBe('Connection lost');
      }
    });

    it('truncates a long error message', () => {
      const longMsg = 'Error: '.repeat(50);
      const commands = dm.getErrorScreen(longMsg);
      const msgCmd = commands[3];
      if (msgCmd.type === 'show_text') {
        expect(msgCmd.text.length).toBeLessThanOrEqual(MAX_TURN_CHARS);
      }
    });
  });

  // ── Status Screen ────────────────────────────────────────────────

  describe('getStatusScreen', () => {
    it('shows the correct status for booting', () => {
      const commands = dm.getStatusScreen('booting');
      expect(commands[1]).toEqual({ type: 'show_status', status: 'booting' });
      const label = commands[2];
      if (label.type === 'show_text') {
        expect(label.text).toBe('Starting up...');
      }
    });

    it('shows the correct status for connecting', () => {
      const commands = dm.getStatusScreen('connecting');
      const label = commands[2];
      if (label.type === 'show_text') {
        expect(label.text).toBe('Connecting...');
      }
    });

    it('shows the correct status for ready', () => {
      const commands = dm.getStatusScreen('ready');
      const label = commands[2];
      if (label.type === 'show_text') {
        expect(label.text).toBe('Ready!');
      }
    });

    it('shows the correct status for offline', () => {
      const commands = dm.getStatusScreen('offline');
      const label = commands[2];
      if (label.type === 'show_text') {
        expect(label.text).toBe('Offline');
      }
    });

    it('shows the correct status for updating', () => {
      const commands = dm.getStatusScreen('updating');
      const label = commands[2];
      if (label.type === 'show_text') {
        expect(label.text).toBe('Updating...');
      }
    });

    it('includes detail text when provided', () => {
      const commands = dm.getStatusScreen('connecting', 'Looking for WiFi...');
      expect(commands).toHaveLength(4);
      const detailCmd = commands[3];
      if (detailCmd.type === 'show_text') {
        expect(detailCmd.text).toBe('Looking for WiFi...');
      }
    });

    it('omits detail text when not provided', () => {
      const commands = dm.getStatusScreen('booting');
      expect(commands).toHaveLength(3);
    });

    it('truncates long detail text', () => {
      const longDetail = 'd'.repeat(200);
      const commands = dm.getStatusScreen('connecting', longDetail);
      const detailCmd = commands[3];
      if (detailCmd.type === 'show_text') {
        expect(detailCmd.text.length).toBeLessThanOrEqual(MAX_TURN_CHARS);
      }
    });
  });

  // ── Menu Screen ──────────────────────────────────────────────────

  describe('getMenuScreen', () => {
    const baseItems = [
      { id: 'math', label: 'Math Helper', icon: '+' },
      { id: 'science', label: 'Science Lab', icon: '!' },
    ];

    it('starts with clear and shows title', () => {
      const commands = dm.getMenuScreen('Pick a Topic', baseItems);
      expect(commands[0]).toEqual({ type: 'clear' });
      const titleCmd = commands[1];
      if (titleCmd.type === 'show_text') {
        expect(titleCmd.text).toBe('Pick a Topic');
      }
    });

    it('shows menu items', () => {
      const commands = dm.getMenuScreen('Pick a Topic', baseItems);
      const menuCmd = commands[2];
      expect(menuCmd.type).toBe('show_menu');
      if (menuCmd.type === 'show_menu') {
        expect(menuCmd.items).toHaveLength(2);
        expect(menuCmd.items[0].id).toBe('math');
        expect(menuCmd.items[0].label).toBe('Math Helper');
        expect(menuCmd.items[0].icon).toBe('+');
      }
    });

    it('limits visible items to MAX_VISIBLE_MENU_ITEMS', () => {
      const manyItems = Array.from({ length: 10 }, (_, i) => ({
        id: `item-${i}`,
        label: `Item ${i}`,
      }));
      const commands = dm.getMenuScreen('Long Menu', manyItems);
      const menuCmd = commands[2];
      if (menuCmd.type === 'show_menu') {
        expect(menuCmd.items).toHaveLength(MAX_VISIBLE_MENU_ITEMS);
      }
    });

    it('truncates long menu item labels', () => {
      const longItems = [
        { id: 'long', label: 'This label is way too long for the screen' },
      ];
      const commands = dm.getMenuScreen('Menu', longItems);
      const menuCmd = commands[2];
      if (menuCmd.type === 'show_menu') {
        expect(menuCmd.items[0].label.length).toBeLessThanOrEqual(MAX_MENU_LABEL_CHARS);
      }
    });
  });

  // ── Command Structure Validation ─────────────────────────────────

  describe('command structure', () => {
    it('all screen generators start with a clear command', () => {
      const screens: DisplayCommand[][] = [
        dm.getIdleScreen('Test', 'Hi'),
        dm.getConversationScreen('Test', [], false),
        dm.getThinkingScreen('Test'),
        dm.getErrorScreen('Oops'),
        dm.getStatusScreen('ready'),
        dm.getMenuScreen('Menu', []),
      ];

      for (const commands of screens) {
        expect(commands[0]).toEqual({ type: 'clear' });
      }
    });

    it('every command has a valid type field', () => {
      const validTypes = new Set([
        'show_text',
        'show_avatar',
        'show_status',
        'show_conversation',
        'show_menu',
        'clear',
      ]);

      const allCommands = [
        ...dm.getIdleScreen('Test', 'Hi'),
        ...dm.getConversationScreen('Test', [{ role: 'user', text: 'hi', timestamp: 0 }], true),
        ...dm.getThinkingScreen('Test'),
        ...dm.getErrorScreen('Err'),
        ...dm.getStatusScreen('booting', 'details'),
        ...dm.getMenuScreen('Menu', [{ id: 'a', label: 'A' }]),
      ];

      for (const cmd of allCommands) {
        expect(validTypes.has(cmd.type)).toBe(true);
      }
    });
  });
});
