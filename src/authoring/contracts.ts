import type { Command, JsonSchema, WorldDefinition } from '../contracts.ts';
import type { TextView } from '../adapters/text.ts';

export interface WorldPackage { format: 1; world: WorldDefinition; demo: Command[] }
export type PackageInspection = {
  ok: true;
  worldId: string;
  title: string;
  moduleCount: number;
  actions: { target: string; action: string; schema: JsonSchema }[];
  view: TextView;
  demo: { executed: boolean; steps: number; finalRevision: number };
  restored: true;
} | {
  ok: false;
  stage: 'package' | 'assembly' | 'view' | 'demo' | 'restore';
  error: { code: string; message: string };
  step?: number;
};
