/**
 * Display protocol types for BOX-3 touchscreen devices.
 *
 * The BOX-3 has a 2.4" IPS touchscreen (320x240) that shows agent state,
 * conversation, and simple UI elements. These types define the protocol
 * between the runtime and device firmware — the runtime sends DisplayCommands
 * over WebSocket, and the device sends back TouchEvents.
 */

// ── Display Commands (runtime -> device) ─────────────────────────────

export type DisplayCommand =
  | { type: 'show_text'; text: string; style?: TextStyle }
  | { type: 'show_avatar'; state: AvatarState }
  | { type: 'show_status'; status: DeviceStatus }
  | { type: 'show_conversation'; turns: DisplayTurn[] }
  | { type: 'show_menu'; items: MenuItem[] }
  | { type: 'clear' };

export interface TextStyle {
  size: 'small' | 'medium' | 'large';
  align: 'left' | 'center' | 'right';
  color?: string; // hex color, e.g. '#ffffff'
}

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type DeviceStatus = 'booting' | 'connecting' | 'ready' | 'offline' | 'updating';

export interface DisplayTurn {
  role: 'user' | 'agent';
  text: string;      // truncated for display (max 100 chars)
  timestamp: number;
}

export interface MenuItem {
  id: string;
  label: string;     // max 20 chars for display
  icon?: string;      // emoji or icon name
}

// ── Touch Events (device -> runtime) ─────────────────────────────────

export type TouchEvent =
  | { type: 'tap'; x: number; y: number }
  | { type: 'menu_select'; item_id: string }
  | { type: 'swipe'; direction: 'left' | 'right' | 'up' | 'down' };

// ── Display Themes ───────────────────────────────────────────────────

export interface DisplayTheme {
  id: string;
  name: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  avatar_style: 'minimal' | 'expressive' | 'pixel';
}

export const DEFAULT_THEMES: DisplayTheme[] = [
  {
    id: 'default',
    name: 'Elisa Blue',
    background_color: '#1a1a2e',
    text_color: '#ffffff',
    accent_color: '#4361ee',
    avatar_style: 'expressive',
  },
  {
    id: 'forest',
    name: 'Forest',
    background_color: '#1b4332',
    text_color: '#d8f3dc',
    accent_color: '#95d5b2',
    avatar_style: 'minimal',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    background_color: '#3d0000',
    text_color: '#ffccd5',
    accent_color: '#ff6b6b',
    avatar_style: 'expressive',
  },
  {
    id: 'pixel',
    name: 'Pixel Art',
    background_color: '#0f0f0f',
    text_color: '#00ff00',
    accent_color: '#ff00ff',
    avatar_style: 'pixel',
  },
];

// ── Display Constraints ──────────────────────────────────────────────

/** BOX-3 screen resolution: 320x240 pixels. */
export const DISPLAY_WIDTH = 320;
export const DISPLAY_HEIGHT = 240;

/** Maximum characters for a conversation turn on the display. */
export const MAX_TURN_CHARS = 100;

/** Maximum characters for a menu item label. */
export const MAX_MENU_LABEL_CHARS = 20;

/** Maximum number of conversation turns visible on screen. */
export const MAX_VISIBLE_TURNS = 4;

/** Maximum number of menu items visible on screen. */
export const MAX_VISIBLE_MENU_ITEMS = 5;
