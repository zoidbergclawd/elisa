import Blockly from 'blockly';

export interface DeviceManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  colour: number;
  board: { type: string; variant: string; connection: string; detection?: { usb_vid?: string; usb_pid?: string } } | null;
  capabilities: Array<{ id: string; name: string; kind: string }>;
  blocks: Array<{
    type: string;
    message: string;
    args: Array<Record<string, unknown>>;
    previousStatement?: boolean;
    nextStatement?: boolean;
    output?: string;
    tooltip?: string;
  }>;
  deploy: Record<string, unknown>;
}

export function registerDeviceBlocks(manifests: DeviceManifest[]): void {
  for (const manifest of manifests) {
    for (const blockDef of manifest.blocks) {
      if (Blockly.Blocks[blockDef.type]) continue; // don't re-register
      Blockly.Blocks[blockDef.type] = {
        init(this: Blockly.Block) {
          this.jsonInit({ ...blockDef, colour: manifest.colour });
        },
      };
    }
  }
}
