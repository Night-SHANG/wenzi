import { ModuleRegistry } from './engine/index.ts';
import { farmModules } from './modules/farm.ts';
import { adventureModules } from './modules/adventure.ts';

/** Convenience catalogue only: the runtime never imports this file. */
export function builtinRegistry(): ModuleRegistry {
  return new ModuleRegistry([...farmModules, ...adventureModules]);
}
