import type { Skill, Rule } from '../../components/Skills/types';
import type { Portal } from '../../components/Portals/types';
import { simpleWebApp } from './simpleWebApp';
import { hardwareBlink } from './hardwareBlink';
import { teamBuild } from './teamBuild';
import { spaceDodge } from './spaceDodge';
import { skillShowcase } from './skillShowcase';

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
}

export const EXAMPLE_NUGGETS: ExampleNugget[] = [
  simpleWebApp,
  hardwareBlink,
  teamBuild,
  spaceDodge,
  skillShowcase,
];
