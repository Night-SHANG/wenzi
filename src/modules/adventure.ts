import type { ModuleDefinition } from '../contracts.ts';
import { seededRandomModule } from './random.ts';
import { tacticsModule } from './tactics.ts';
import { tacticsTextViewModule } from './tactics-view.ts';
import { narrativeModule, narrativeTextViewModule } from './narrative.ts';

export const adventureModules: ModuleDefinition[] = [seededRandomModule, tacticsModule, tacticsTextViewModule, narrativeModule, narrativeTextViewModule];
