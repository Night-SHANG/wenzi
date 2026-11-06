import { builtinRegistry } from '../src/catalog.ts';
import { createWorld, restoreWorld } from '../src/engine/index.ts';
import { worldNames, loadWorldPackage } from '../src/worlds.ts';
import { readTextView } from '../src/adapters/text.ts';
const registry = builtinRegistry();
for (const name of await worldNames()) {
  const pack = await loadWorldPackage(name);
  const runtime = createWorld(registry, pack.world);
  for (const command of pack.demo) {
    const result = runtime.dispatch(command);
    if (!result.ok) throw new Error(`${name}: ${JSON.stringify(result.error)}`);
  }
  readTextView(restoreWorld(registry, runtime.snapshot()));
  console.log(`世界通过：${name}，${runtime.revision} 次行动`);
}
