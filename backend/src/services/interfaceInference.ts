/**
 * PRD-003 Phase 2: Interface Inference Service.
 *
 * Auto-generates provides/requires interface declarations from a
 * NuggetSpec's Portal and Skill blocks. Replaces the manual
 * nugget_provides/nugget_requires block system.
 *
 * What a nugget produces:
 * - Output-facing Portals (capabilities with kind 'action' or 'event')
 * - Skill artifacts (skills that generate outputs)
 *
 * What a nugget consumes:
 * - Input-facing Portals (capabilities with kind 'query')
 * - Device requirements (spec.devices)
 */

import type { NuggetSpec } from '../utils/specValidator.js';

export interface InferredInterface {
  name: string;
  type: string;
  description?: string;
}

export interface NuggetInterfaceSummary {
  provides: InferredInterface[];
  requires: InferredInterface[];
}

/**
 * Infer interface contracts from a NuggetSpec's portals and skills.
 * This is the metadata the meta planner uses for cross-nugget
 * dependency resolution.
 */
export function inferInterfaces(spec: NuggetSpec): NuggetInterfaceSummary {
  const provides: InferredInterface[] = [];
  const requires: InferredInterface[] = [];

  // Infer from portals
  if (spec.portals) {
    for (const portal of spec.portals) {
      const portalName = portal.name ?? portal.id ?? 'unknown';
      const mechanism = portal.mechanism ?? 'auto';

      if (portal.capabilities) {
        for (const cap of portal.capabilities) {
          const kind = cap.kind ?? '';
          const capName = cap.name ?? cap.id ?? 'unknown';

          if (kind === 'action' || kind === 'event') {
            // Actions and events are things this nugget can produce/emit
            provides.push({
              name: `${portalName}/${capName}`,
              type: kind,
              description: cap.description ?? `${kind} via ${portalName}`,
            });
          } else if (kind === 'query') {
            // Queries are things this nugget needs from outside
            requires.push({
              name: `${portalName}/${capName}`,
              type: 'query',
              description: cap.description ?? `query from ${portalName}`,
            });
          }
        }
      }

      // If no capabilities parsed, infer from mechanism
      if (!portal.capabilities?.length) {
        if (mechanism === 'serial' || portal.subtype === 'device') {
          provides.push({
            name: portalName,
            type: 'device',
            description: `Hardware interface: ${portalName}`,
          });
        } else if (portal.subtype === 'knowledge') {
          requires.push({
            name: portalName,
            type: 'knowledge',
            description: `Knowledge source: ${portalName}`,
          });
        } else {
          // Generic portal -- classify by interactions
          const hasOutputInteractions = portal.interactions?.some(
            (i) => i.type === 'tell',
          );
          const hasInputInteractions = portal.interactions?.some(
            (i) => i.type === 'ask' || i.type === 'when',
          );
          if (hasOutputInteractions) {
            provides.push({
              name: portalName,
              type: 'api',
              description: `API output: ${portalName}`,
            });
          }
          if (hasInputInteractions) {
            requires.push({
              name: portalName,
              type: 'api',
              description: `API input: ${portalName}`,
            });
          }
        }
      }
    }
  }

  // Infer from deployment target
  const target = spec.deployment?.target;
  if (target === 'web' || target === 'both') {
    provides.push({
      name: 'web-endpoint',
      type: 'endpoint',
      description: 'Web deployment endpoint',
    });
  }
  if (target === 'esp32' || target === 'both') {
    provides.push({
      name: 'device-output',
      type: 'device',
      description: 'Hardware device output',
    });
  }

  // Infer from devices
  if (spec.devices) {
    for (const device of spec.devices) {
      requires.push({
        name: device.pluginId,
        type: 'device',
        description: `Device plugin: ${device.pluginId}`,
      });
    }
  }

  // Infer from skills (skills that produce artifacts)
  if (spec.skills) {
    for (const skill of spec.skills) {
      if (skill.category === 'feature') {
        provides.push({
          name: `skill/${skill.name ?? skill.id}`,
          type: 'artifact',
          description: `Feature skill: ${skill.name}`,
        });
      }
    }
  }

  return { provides, requires };
}
