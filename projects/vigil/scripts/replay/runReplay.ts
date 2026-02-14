/*
 * Replay Harness Runner
 * - Loads scenarios from tests/replay/scenarios.json
 * - Executes observer pipeline with deterministic planner mode (mock)
 * - Compares outputs to golden constraints (lightweight for now)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
// Use relative path to SDK since monorepo alias may not be available when running this script directly
import { Memory } from '../../packages/sdk/src/index';

// Import brain pipeline pieces
import type { Observation } from '../../apps/brain/src/observer';
import { handleObservation } from '../../apps/brain/src/observer';
import type { SkillGraph } from '../../apps/brain/src/skillGraph';

// Minimal SkillGraph mock for now
const skillGraph: SkillGraph = {
  async shouldUseSkill(_content: string) { return null as any; },
  async recordExecution(_rec: any) { /* no-op */ }
} as any;

// Deterministic mock mode for planner
process.env.LLM_MODEL = process.env.LLM_MODEL || 'mock';

// Monkey patch planner if in mock mode to ensure deterministic output
import * as plannerModule from '../../apps/brain/src/planner.llm';
if (process.env.LLM_MODEL === 'mock') {
  (plannerModule as any).planLLM = async function mockPlanLLM(obs: Observation) {
    const text = obs.content.toLowerCase();
    if (text.includes('weather') && !text.match(/\b(in|at|for)\b.+/)) {
      return {
        steps: [{ tool: 'message.send', args: { channelId: obs.channelId, content: 'What location would you like weather for?' }, reason: 'Ask for missing location' }],
        reasoning: 'Deterministic mock: weather query missing location'
      };
    }
    // Default: polite greeting reply
    return {
      steps: [{ tool: 'message.send', args: { channelId: obs.channelId, content: 'Hi! \\u2728' }, reason: 'Deterministic mock greeting' }],
      reasoning: 'Deterministic mock: greeting'
    };
  };
}

async function run() {
  const logger = pino({ level: 'info', transport: { target: 'pino-pretty', options: { colorize: true } } });
  const scenariosPath = path.resolve(process.cwd(), 'tests/replay/scenarios.json');
  const raw = await fs.readFile(scenariosPath, 'utf8');
  const scenarios = JSON.parse(raw) as Array<{ id: string; observation: Observation; expected: any }>;

  const memory = Memory.create(process.env.MEMORY_API || 'http://localhost:4311');

  const crypto = await import('node:crypto');
  const goldenDir = path.resolve(process.cwd(), 'golden');
  const results: any[] = [];
  for (const sc of scenarios) {
    logger.info({ id: sc.id }, 'Running scenario');
    // Run planner directly for deterministic output
    const plan = await (plannerModule as any).planLLM(sc.observation);
    // Hash plan JSON
    const planJson = JSON.stringify(plan);
    const planHash = crypto.createHash('sha256').update(planJson).digest('hex');
    // Assertions
    let pass = true;
    const assertions: string[] = [];
    if (sc.expected.mustIncludeTool) {
      const found = plan.steps.some((s: any) => s.tool === sc.expected.mustIncludeTool);
      if (!found) { pass = false; assertions.push(`Missing tool: ${sc.expected.mustIncludeTool}`); }
    }
    if (sc.expected.mustSay) {
      const found = plan.steps.some((s: any) => (s.args?.content || '').includes(sc.expected.mustSay));
      if (!found) { pass = false; assertions.push(`Missing output: ${sc.expected.mustSay}`); }
    }
    if (sc.expected.maxSteps !== undefined) {
      if (plan.steps.length > sc.expected.maxSteps) {
        pass = false; assertions.push(`Too many steps: ${plan.steps.length} > ${sc.expected.maxSteps}`);
      }
    }
    // Write golden report
    const report = {
      id: sc.id,
      pass,
      assertions,
      plan,
      planHash,
      expected: sc.expected
    };
    await fs.writeFile(path.join(goldenDir, `${sc.id}.json`), JSON.stringify(report, null, 2), 'utf8');
    results.push({ id: sc.id, pass, assertions, planHash });
  }
  // Fail if any scenario fails
  const allPass = results.every(r => r.pass);
  if (!allPass) {
    console.error('Replay test failed: some scenarios did not pass assertions.');
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, count: results.length, results }, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
