export type PortalMechanism = 'mcp' | 'cli' | 'auto';
export type PortalStatus = 'unconfigured' | 'ready' | 'error';

export interface PortalCapability {
  id: string;
  name: string;
  kind: 'action' | 'event' | 'query';
  description: string;
  params?: PortalParam[];
}

export interface PortalParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  description: string;
  default?: string | number | boolean;
  choices?: string[];
}

export interface Portal {
  id: string;
  name: string;
  description: string;
  mechanism: PortalMechanism;
  status: PortalStatus;
  capabilities: PortalCapability[];
  mcpConfig?: { command: string; args?: string[]; env?: Record<string, string> };
  cliConfig?: { command: string; installHint?: string };
  templateId?: string;
}
