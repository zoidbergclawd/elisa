/** SpecGraph data model types for the directed graph of NuggetSpecs. */

import type { NuggetSpec } from '../utils/specValidator.js';

export interface SpecGraphNode {
  id: string;
  nugget_spec: NuggetSpec;
  label: string;
  created_at: number;
  updated_at: number;
}

export type EdgeRelationship = 'depends_on' | 'provides_to' | 'shares_interface' | 'composes_into';

export interface SpecGraphEdge {
  from_id: string;
  to_id: string;
  relationship: EdgeRelationship;
  description?: string;
}

export interface SpecGraph {
  id: string;
  nodes: SpecGraphNode[];
  edges: SpecGraphEdge[];
  workspace_path: string;
  created_at: number;
  updated_at: number;
}

export interface SpecGraphPersistence {
  version: number;
  nodes: SpecGraphNode[];
  edges: SpecGraphEdge[];
  created_at: number;
  updated_at: number;
}
