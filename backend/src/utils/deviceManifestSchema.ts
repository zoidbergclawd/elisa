/** Zod schema for device plugin manifest (device.json) validation. */

import { z } from 'zod';

const BlockFieldSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('field_checkbox'), name: z.string(), checked: z.boolean().default(false) }),
  z.object({ type: z.literal('field_number'), name: z.string(), value: z.number().default(0),
             min: z.number().optional(), max: z.number().optional() }),
  z.object({ type: z.literal('field_dropdown'), name: z.string(),
             options: z.array(z.tuple([z.string(), z.string()])).min(1) }),
  z.object({ type: z.literal('field_input'), name: z.string(), text: z.string().default('') }),
  z.object({ type: z.literal('input_dummy') }),
]);

const BlockDefinitionSchema = z.object({
  type: z.string().regex(/^[a-z][a-z0-9_]*$/).max(60),
  message: z.string().max(500),
  args: z.array(BlockFieldSchema).max(20),
  previousStatement: z.boolean().default(true),
  nextStatement: z.boolean().default(true),
  output: z.string().optional(),
  tooltip: z.string().max(300).optional(),
});

const CapabilitySchema = z.object({
  id: z.string().max(50),
  name: z.string().max(100),
  kind: z.enum(['sensor', 'actuator', 'display', 'radio', 'network', 'compute']),
  params: z.array(z.object({
    name: z.string().max(50),
    type: z.enum(['number', 'string', 'boolean']),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })).max(10).default([]),
});

const BoardSchema = z.object({
  type: z.string().max(50),
  variant: z.string().max(50),
  connection: z.enum(['serial', 'wifi', 'bluetooth']),
  detection: z.object({
    usb_vid: z.string().regex(/^0x[0-9A-Fa-f]{4}$/).optional(),
    usb_pid: z.string().regex(/^0x[0-9A-Fa-f]{4}$/).optional(),
  }).optional(),
}).nullable();

const DeployParamSchema = z.object({
  name: z.string().max(50),
  field: z.string().max(50),
  default: z.union([z.string(), z.number()]).optional(),
});

const RuntimeProvisionSchema = z.object({
  required: z.boolean().default(false),
  config_fields: z.array(z.string().max(50)).max(20).default([]),
});

const FlashDeploySchema = z.object({
  method: z.literal('flash'),
  provides: z.array(z.string().max(50)).max(10).default([]),
  requires: z.array(z.string().max(50)).max(10).default([]),
  flash: z.object({
    files: z.array(z.string().max(100)).min(1).max(20),
    lib: z.array(z.string().max(100)).max(20).default([]),
    shared_lib: z.array(z.string().max(100)).max(10).default([]),
    prompt_message: z.string().max(200),
  }),
  runtime_provision: RuntimeProvisionSchema.optional(),
});

const CloudDeploySchema = z.object({
  method: z.literal('cloud'),
  provides: z.array(z.string().max(50)).min(1).max(10),
  requires: z.array(z.string().max(50)).max(10).default([]),
  cloud: z.object({
    platform: z.string().max(50),
    scaffold_dir: z.string().max(100),
    params: z.array(DeployParamSchema).max(10).default([]),
  }),
});

const EsptoolDeploySchema = z.object({
  method: z.literal('esptool'),
  provides: z.array(z.string().max(50)).max(10).default([]),
  requires: z.array(z.string().max(50)).max(10).default([]),
  esptool: z.object({
    firmware_file: z.string().max(200),
    flash_offset: z.string().max(20).default('0x0'),
    baud_rate: z.number().int().default(460800),
    chip: z.string().max(30).default('esp32s3'),
    prompt_message: z.string().max(200),
  }),
  runtime_provision: RuntimeProvisionSchema.optional(),
});

export const DeviceManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/).max(60),
  name: z.string().max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(500),
  icon: z.string().max(50).optional(),
  colour: z.number().int().min(0).max(360),

  board: BoardSchema,
  capabilities: z.array(CapabilitySchema).max(30).default([]),
  blocks: z.array(BlockDefinitionSchema).min(1).max(10),
  deploy: z.union([FlashDeploySchema, CloudDeploySchema, EsptoolDeploySchema]),

  spec_mapping: z.object({
    role: z.string().max(50),
    extract_fields: z.record(z.string(), z.unknown()),
  }).optional(),
});

export type DeviceManifest = z.infer<typeof DeviceManifestSchema>;
export type BlockDefinition = z.infer<typeof BlockDefinitionSchema>;
