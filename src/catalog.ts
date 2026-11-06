import { ModuleRegistry } from './engine/index.ts';
import { farmModules } from './modules/farm.ts';
import { adventureModules } from './modules/adventure.ts';
import { frontierModules } from './modules/frontier.ts';

/** Convenience catalogue only: the runtime never imports this file. */
export function builtinRegistry(): ModuleRegistry {
  return new ModuleRegistry([...farmModules, ...adventureModules, ...frontierModules]);
}
