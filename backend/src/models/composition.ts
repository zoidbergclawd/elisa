/** Composition data model types for nugget composition and emergence detection. */

import type { NuggetSpec } from '../utils/specValidator.js';

export interface InterfaceContract {
  provider_node_id: string;
  consumer_node_id: string;
  interface_name: string;
  type: string;
}

export interface EmergentBehavior {
  description: string;
  contributing_nodes: string[];
  detected_pattern: 'feedback_loop' | 'pipeline' | 'hub';
}

export interface ComposeResult {
  composed_spec: NuggetSpec;
  emergent_behaviors: EmergentBehavior[];
  interface_contracts: InterfaceContract[];
  warnings: string[];
}

export interface AffectedNode {
  node_id: string;
  label: string;
  reason: string;
}

export interface ImpactResult {
  affected_nodes: AffectedNode[];
  severity: 'none' | 'minor' | 'breaking';
}
