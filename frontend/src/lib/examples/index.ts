import type { Skill, Rule } from '../../components/Skills/types';
import type { Portal } from '../../components/Portals/types';
import { simpleWebApp } from './simpleWebApp';
import { hardwareBlink } from './hardwareBlink';
import { teamBuild } from './teamBuild';
import { spaceDodge } from './spaceDodge';
import { skillShowcase } from './skillShowcase';
import { rulesShowcase } from './rulesShowcase';
import { iotSensorNetwork } from './iotSensorNetwork';
import { s3BoxAgent } from './s3BoxAgent';

export interface ExampleNugget {
  id: string;
  name: string;
  description: string;
  category: 'web' | 'hardware' | 'multi-agent' | 'game';
  color: string;
  accentColor: string;
  workspace: Record<string, unknown>;
  skills: Skill[];
  rules: Rule[];
  portals: Portal[];
  requiredDevices?: string[];
}

export const EXAMPLE_NUGGETS: ExampleNugget[] = [
  simpleWebApp,
  hardwareBlink,
  iotSensorNetwork,
  s3BoxAgent,
  teamBuild,
  spaceDodge,
  skillShowcase,
  rulesShowcase,
];
