import type { ModuleDefinition } from '../contracts.ts';
import { equipmentRulesModule } from './equipment-rules.ts';
import { equipmentModule } from './equipment.ts';
import { effectRulesModule } from './effect-rules.ts';
import { effectRefreshModule, effectExtendModule } from './effect-duration.ts';
import { effectsModule } from './effects.ts';
import { attributesModule } from './attributes.ts';
import { skillRulesModule } from './skill-rules.ts';
import { skillsModule } from './skills.ts';
import { loadoutViewModule } from './loadout-view.ts';

export const loadoutModules: ModuleDefinition[] = [
  equipmentRulesModule, equipmentModule, effectRulesModule, effectRefreshModule, effectExtendModule,
  effectsModule, attributesModule, skillRulesModule, skillsModule, loadoutViewModule,
];
