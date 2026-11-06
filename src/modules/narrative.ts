import type { JsonValue, ModuleDefinition } from '../contracts.ts';

interface Choice { id: string; label: string; next: string }
interface StoryNode { text: string; choices: Choice[] }
interface StoryConfig { start: string; nodes: Record<string, StoryNode> }
interface StoryState { node: string; visits: number }
const choiceSchema = { type: 'object', additionalProperties: false, required: ['id', 'label', 'next'], properties: { id: { type: 'string', minLength: 1 }, label: { type: 'string', minLength: 1 }, next: { type: 'string', minLength: 1 } } };
export const narrativeModule: ModuleDefinition = {
  manifest: {
    id: 'narrative.branching', title: '分支叙事', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { narrative: '1.0.0' }, provenance: { origin: '本项目独立实现', license: 'UNLICENSED' },
  },
  configSchema: {
    type: 'object', additionalProperties: false, required: ['start', 'nodes'], properties: {
      start: { type: 'string', minLength: 1 },
      nodes: { type: 'object', minProperties: 1, propertyNames: { minLength: 1 }, additionalProperties: {
        type: 'object', additionalProperties: false, required: ['text', 'choices'], properties: { text: { type: 'string' }, choices: { type: 'array', items: choiceSchema } },
      } },
    },
  },
  stateSchema: { type: 'object', additionalProperties: false, required: ['node', 'visits'], properties: { node: { type: 'string', minLength: 1 }, visits: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER } } },
  initialState: config => ({ node: config.start!, visits: 1 }),
  validate(context) {
    const config = context.config as unknown as StoryConfig;
    const owns = (key: string) => Object.hasOwn(config.nodes, key);
    if (!owns(config.start)) context.fail('NARRATIVE_START', '叙事起点不存在。');
    for (const [id, node] of Object.entries(config.nodes)) {
      const ids = new Set<string>();
      for (const choice of node.choices) {
        if (ids.has(choice.id)) context.fail('NARRATIVE_DUPLICATE_CHOICE', `节点「${id}」的选项标识重复。`);
        ids.add(choice.id);
        if (!owns(choice.next)) context.fail('NARRATIVE_NEXT', `选项「${choice.id}」指向不存在的节点。`);
      }
    }
    if (!owns(context.state<StoryState>().node)) context.fail('NARRATIVE_NODE', '当前叙事节点不存在。');
  },
  commands: {
    choose: {
      schema: { type: 'object', additionalProperties: false, required: ['choice'], properties: { choice: { type: 'string', minLength: 1 } } },
      execute(context, input) {
        const state = context.state<StoryState>();
        const config = context.config as unknown as StoryConfig;
        const node = config.nodes[state.node]!;
        const choice = node.choices.find(candidate => candidate.id === input.choice);
        if (!choice) return context.fail('NARRATIVE_CHOICE', '当前节点没有这个选项。');
        const next = { node: choice.next, visits: state.visits + 1 };
        context.write(next);
        context.emit('narrative.changed', { from: state.node, node: next.node, choice: choice.id, visits: next.visits });
        return next;
      },
    },
  },
  queries: {
    scene: {
      schema: { type: 'object', additionalProperties: false },
      execute(context) {
        const state = context.state<StoryState>();
        const node = (context.config as unknown as StoryConfig).nodes[state.node]!;
        return { node: state.node, text: node.text, choices: node.choices, visits: state.visits } as unknown as JsonValue;
      },
    },
  },
};

export const narrativeTextViewModule: ModuleDefinition = {
  manifest: {
    id: 'view.narrative.text', title: '叙事文字视图', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { 'text-view': '1.0.0' }, requires: { narrative: { version: '^1.0.0' } },
    provenance: { origin: '本项目独立实现', license: 'UNLICENSED' },
  },
  configSchema: { type: 'object', additionalProperties: false },
  stateSchema: { type: 'object', additionalProperties: false },
  initialState: () => ({}),
  queries: {
    render: {
      schema: { type: 'object', additionalProperties: false },
      execute(context) {
        const scene = context.query('narrative', 'scene') as unknown as StoryNode & StoryState;
        return { title: '分支故事', lines: [scene.text, `节点：${scene.node}｜访问次数：${scene.visits}`, ...scene.choices.map(choice => `[${choice.id}] ${choice.label}`), ...(scene.choices.length ? [] : ['故事暂告一段落。'])] };
      },
    },
  },
};
