import type { ModuleDefinition } from '../contracts.ts';
import { progressionRulesModule } from './progression-rules.ts';
import { progressionModule } from './progression.ts';
import { vitalsModule } from './vitals.ts';
import { recoveryModule } from './recovery.ts';
import { encounterRulesModule } from './encounter-rules.ts';
import { combatRulesModule } from './combat-rules.ts';
import { encountersModule } from './encounters.ts';
import { questRulesModule } from './quest-rules.ts';
import { questsModule } from './quests.ts';
import { campaignViewModule } from './campaign-view.ts';

export const campaignModules: ModuleDefinition[] = [
  progressionRulesModule, progressionModule, vitalsModule, recoveryModule,
  encounterRulesModule, combatRulesModule, encountersModule, questRulesModule, questsModule, campaignViewModule,
];
