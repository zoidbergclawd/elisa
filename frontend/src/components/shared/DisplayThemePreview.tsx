/**
 * DisplayThemePreview — shows how the BOX-3 screen will look with a given theme.
 *
 * Renders a 320x240 ratio preview box with the theme's colors and avatar style.
 * Used in the Blockly canvas when configuring a BOX-3 agent. This is a visual
 * preview only — the actual rendering happens on the device firmware.
 */

interface DisplayTheme {
  id: string;
  name: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  avatar_style: 'minimal' | 'expressive' | 'pixel';
}

interface DisplayThemePreviewProps {
  theme: DisplayTheme;
  agentName?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_SCALES: Record<string, { width: number; height: number }> = {
  sm: { width: 160, height: 120 },
  md: { width: 240, height: 180 },
  lg: { width: 320, height: 240 },
};

const AVATAR_CHARS: Record<string, string> = {
  minimal: '\u25CF',     // filled circle
  expressive: '\u263A',  // smiley
  pixel: '\u2588',       // full block
};

export default function DisplayThemePreview({
  theme,
  agentName = 'Agent',
  size = 'md',
}: DisplayThemePreviewProps) {
  const dims = SIZE_SCALES[size] || SIZE_SCALES.md;
  const avatarChar = AVATAR_CHARS[theme.avatar_style] || AVATAR_CHARS.expressive;

  // Scale font sizes relative to the preview size
  const avatarSize = Math.round(dims.height * 0.2);
  const nameSize = Math.round(dims.height * 0.08);
  const greetingSize = Math.round(dims.height * 0.06);

  return (
    <div
      data-testid="display-theme-preview"
      className="rounded-lg overflow-hidden border border-white/10 shadow-md inline-block"
      style={{
        width: dims.width,
        height: dims.height,
        backgroundColor: theme.background_color,
      }}
    >
      <div className="flex flex-col items-center justify-center h-full gap-1 p-2">
        {/* Avatar indicator */}
        <div
          data-testid="preview-avatar"
          className="flex items-center justify-center rounded-full"
          style={{
            width: avatarSize,
            height: avatarSize,
            backgroundColor: theme.accent_color,
            fontSize: avatarSize * 0.5,
            color: theme.background_color,
            lineHeight: 1,
          }}
        >
          {avatarChar}
        </div>

        {/* Agent name */}
        <div
          data-testid="preview-agent-name"
          className="font-bold truncate max-w-full px-2 text-center"
          style={{
            color: theme.accent_color,
            fontSize: nameSize,
            lineHeight: 1.2,
          }}
        >
          {agentName}
        </div>

        {/* Greeting placeholder */}
        <div
          data-testid="preview-greeting"
          className="truncate max-w-full px-3 text-center"
          style={{
            color: theme.text_color,
            fontSize: greetingSize,
            lineHeight: 1.3,
            opacity: 0.8,
          }}
        >
          Hi! How can I help?
        </div>

        {/* Status bar at bottom */}
        <div
          data-testid="preview-status-bar"
          className="mt-auto w-full flex items-center justify-between px-2"
          style={{ opacity: 0.5 }}
        >
          <div
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: theme.accent_color,
            }}
          />
          <div
            className="text-center truncate"
            style={{
              color: theme.text_color,
              fontSize: Math.max(8, greetingSize * 0.8),
            }}
          >
            {theme.name}
          </div>
          <div
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: theme.accent_color,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export type { DisplayTheme, DisplayThemePreviewProps };
