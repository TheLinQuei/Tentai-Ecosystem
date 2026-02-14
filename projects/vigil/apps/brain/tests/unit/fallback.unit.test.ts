import { describe, it, expect } from 'vitest';
import { attemptPlanWithFallback, FallbackLevel } from '../../src/fallback';

const log: any = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const OBS: any = {
  id: 'obs-fallback-1',
  type: 'MESSAGE',
  content: 'hello',
  authorId: 'user-1',
  channelId: 'chan-1',
  timestamp: new Date().toISOString(),
};

describe('fallback.unit.test', () => {
  it('Happy Path: primary plan provided returns level 1 with high confidence', async () => {
    const primaryPlan: any = {
      steps: [{ tool: 'message.send', args: { channelId: 'chan-1', content: 'Hi!' }, reason: 'greeting' }],
      reasoning: 'primary',
      confidence: 0.9,
    };
    const result = await attemptPlanWithFallback(OBS, log, { primaryPlan });
    expect(result.level).toBe(FallbackLevel.PRIMARY);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.plan.steps.length).toBeGreaterThan(0);
  });

  it('Edge Path: no primary, skill graph provided returns level 2', async () => {
    const skillGraphPlan: any = {
      steps: [{ tool: 'message.send', args: { channelId: 'chan-1', content: 'Skill replay' }, reason: 'skill' }],
      reasoning: 'skill graph',
      confidence: 0.7,
    };
    const result = await attemptPlanWithFallback(OBS, log, { primaryPlan: null, skillGraphPlan });
    expect(result.level).toBe(FallbackLevel.SKILL_GRAPH);
    expect(result.confidence).toBe(0.7);
  });

  it('Hostile Path: all planners fail, keyword heuristic greeting pattern triggers level 4', async () => {
    const result = await attemptPlanWithFallback({ ...OBS, content: 'hi' } as any, log, {
      primaryPlan: null,
      skillGraphPlan: null,
      intentMapPlan: null,
      maxLevel: FallbackLevel.KEYWORD,
    });
    expect(result.level).toBe(FallbackLevel.KEYWORD);
    expect(result.plan.steps[0].tool).toBe('message.send');
    expect(result.plan.steps[0].args.content).toContain('Hey');
  });

  it('Canon Enforcement: echo fallback (level 5) produces safe message.send step', async () => {
    // Use non-keyword content to skip KEYWORD level and reach ECHO
    const nonKeywordObs = { ...OBS, content: 'xyz random input' };
    const result = await attemptPlanWithFallback(nonKeywordObs, log, {
      primaryPlan: null,
      skillGraphPlan: null,
      intentMapPlan: null,
      maxLevel: FallbackLevel.ECHO,
    });
    expect(result.level).toBe(FallbackLevel.ECHO);
    expect(result.plan.steps[0].tool).toBe('message.send');
    expect(result.plan.steps[0].args.content).toContain('I heard you');
  });

  it('Canon Enforcement Edge: silent fail (level 6) returns empty plan with 0 confidence', async () => {
    // Use non-keyword content and maxLevel=KEYWORD to skip ECHO, reaching SILENT
    const nonKeywordObs = { ...OBS, content: 'xyz random input' };
    const result = await attemptPlanWithFallback(nonKeywordObs, log, {
      primaryPlan: null,
      skillGraphPlan: null,
      intentMapPlan: null,
      maxLevel: FallbackLevel.KEYWORD,  // Don't allow ECHO, so SILENT is reached
    });
    expect(result.level).toBe(FallbackLevel.SILENT);
    expect(result.plan.steps.length).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('Boundary: fallback ladder exhaustion (all levels fail, maxLevel=ECHO returns echo plan)', async () => {
    const result = await attemptPlanWithFallback({ ...OBS, content: 'xyz unknown command' } as any, log, {
      primaryPlan: null,
      skillGraphPlan: null,
      intentMapPlan: null,
      maxLevel: FallbackLevel.ECHO,
    });
    // Should reach echo fallback for unrecognized pattern
    expect(result.level).toBe(FallbackLevel.ECHO);
    expect(result.plan.steps[0].tool).toBe('message.send');
    expect(result.plan.steps[0].args.content).toContain('heard');
  });

  it('Boundary: keyword heuristic pattern matching with special characters', async () => {
    const result = await attemptPlanWithFallback({ ...OBS, content: 'hello!! how are you?' } as any, log, {
      maxLevel: FallbackLevel.KEYWORD,
    });
    // Should recognize 'hello' greeting pattern (at start) and produce message.send response
    expect(result.level).toBe(FallbackLevel.KEYWORD);
    expect(result.plan.steps[0].tool).toBe('message.send');
    expect(result.plan.steps[0].args.content).toBeDefined();
  });
});
