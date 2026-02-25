/** Feature gate for OpenClaw block registration and toolbox injection. */

import { OPENCLAW_TOOLBOX_CATEGORIES } from './openclawBlocks';
import { toolbox } from './toolbox';

let enabled = false;

export function isOpenClawEnabled(): boolean {
  return enabled;
}

export function setOpenClawEnabled(value: boolean): void {
  enabled = value;
}

/** Returns the toolbox config, conditionally including OpenClaw categories. */
export function getToolboxWithOpenClaw(): typeof toolbox {
  if (!enabled) return toolbox;
  return {
    ...toolbox,
    contents: [
      ...toolbox.contents,
      ...OPENCLAW_TOOLBOX_CATEGORIES,
    ],
  };
}
