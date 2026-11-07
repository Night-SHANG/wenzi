import { ModuleRegistry } from './engine/index.ts';
import { farmModules } from './modules/farm.ts';
import { adventureModules } from './modules/adventure.ts';
import { frontierModules } from './modules/frontier.ts';
import { campaignModules } from './modules/campaign.ts';
import { loadoutModules } from './modules/loadout.ts';
import { partyModules } from './modules/party-world.ts';

/** Convenience catalogue only: the runtime never imports this file. */
export function builtinRegistry(): ModuleRegistry {
  return new ModuleRegistry([...farmModules, ...adventureModules, ...frontierModules, ...campaignModules, ...loadoutModules, ...partyModules]);
}
