import type { ModuleDefinition } from '../contracts.ts';
import { locationModule } from './location.ts';
import { gatheringRulesModule } from './gathering-rules.ts';
import { gatheringModule } from './gathering.ts';
import { recipesModule } from './recipes.ts';
import { craftingModule } from './crafting.ts';
import { frontierViewModule } from './frontier-view.ts';

export const frontierModules: ModuleDefinition[] = [locationModule, gatheringRulesModule, gatheringModule, recipesModule, craftingModule, frontierViewModule];
