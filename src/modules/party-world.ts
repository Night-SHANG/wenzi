import type { ModuleDefinition } from '../contracts.ts';
import { sessionModule } from './battle-session.ts';
import { companionRulesModule } from './companion-rules.ts';
import { partyModule } from './party.ts';
import { partyVitalsModule } from './party-vitals.ts';
import { squadRulesModule } from './squad-rules.ts';
import { initiativeListedModule, initiativeSpeedModule } from './initiative.ts';
import { targetFirstModule, targetLowestHpModule } from './targeting.ts';
import { partyBattleModule } from './party-battle.ts';
import { partyViewModule } from './party-view.ts';

export const partyModules: ModuleDefinition[] = [
  sessionModule, companionRulesModule, partyModule, partyVitalsModule, squadRulesModule,
  initiativeListedModule, initiativeSpeedModule, targetFirstModule, targetLowestHpModule,
  partyBattleModule, partyViewModule,
];
