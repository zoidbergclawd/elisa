import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlockCanvas from './BlockCanvas';

vi.mock('blockly', () => ({
  inject: vi.fn(() => ({
    addChangeListener: vi.fn(),
    removeChangeListener: vi.fn(),
    dispose: vi.fn(),
    options: { readOnly: false },
  })),
  svgResize: vi.fn(),
  serialization: {
    workspaces: {
      save: vi.fn(() => ({})),
      load: vi.fn(),
    },
  },
}));

vi.mock('./blockDefinitions', () => ({
  registerBlocks: vi.fn(),
}));

vi.mock('./toolbox', () => ({
  toolbox: { kind: 'categoryToolbox', contents: [] },
}));

vi.mock('../Skills/skillsRegistry', () => ({
  updateSkillOptions: vi.fn(),
  updateRuleOptions: vi.fn(),
}));

vi.mock('../Portals/portalRegistry', () => ({
  updatePortalOptions: vi.fn(),
}));

describe('BlockCanvas', () => {
  it('mounts and renders the container', () => {
    render(<BlockCanvas onWorkspaceChange={vi.fn()} />);
    // The component renders a container div
    const container = document.querySelector('.w-full.h-full.relative');
    expect(container).toBeTruthy();
  });

  it('does not show read-only overlay by default', () => {
    render(<BlockCanvas onWorkspaceChange={vi.fn()} />);
    expect(screen.queryByText('Building in progress...')).not.toBeInTheDocument();
  });

  it('shows read-only overlay when readOnly is true', () => {
    render(<BlockCanvas onWorkspaceChange={vi.fn()} readOnly={true} />);
    expect(screen.getByText('Building in progress...')).toBeInTheDocument();
  });

  it('hides read-only overlay when readOnly is false', () => {
    render(<BlockCanvas onWorkspaceChange={vi.fn()} readOnly={false} />);
    expect(screen.queryByText('Building in progress...')).not.toBeInTheDocument();
  });
});
