/**
 * Fault Injection Utilities
 * -------------------------
 * Provides opt‑in runtime perturbations controlled by environment variables.
 * Designed for stress harness usage without modifying production logic.
 *
 * Env Vars:
 *   STRESS_DRY_RUN=1                → Short‑circuit high side‑effect tools (e.g. message.send)
 *   FAULT_FORCE_VALIDATION_FAIL=1   → First attempt per tool returns schema‑invalid output
 *   FAULT_ARTIFICIAL_LATENCY_MS=NN  → Adds artificial latency before tool resolves
 *   FAULT_FORCE_FALLBACK_JSON=1     → Monkey‑patch OpenAI completion to return non‑JSON text
 *   FAULT_TARGET_TOOLS=toolA,toolB  → Limit faults to listed tools (defaults to all)
 */

import { ToolRegistry } from '../tools/registry.js';

interface WrappedState {
  attempts: number;
}

const stateMap: Record<string, WrappedState> = {};

function shouldTarget(tool: string): boolean {
  const list = process.env.FAULT_TARGET_TOOLS?.trim();
  if (!list) return true;
  return list.split(',').map(s => s.trim()).includes(tool);
}

function wrapTool(tool: string, impl: any) {
  if (typeof impl !== 'function') return impl;
  stateMap[tool] = { attempts: 0 };
  const latencyMs = Number(process.env.FAULT_ARTIFICIAL_LATENCY_MS || '0');
  const forceValidationFail = process.env.FAULT_FORCE_VALIDATION_FAIL === '1';
  const dryRun = process.env.STRESS_DRY_RUN === '1';

  return async function wrapped(args: any) {
    stateMap[tool].attempts += 1;
    const attempt = stateMap[tool].attempts;

    // Artificial latency
    if (latencyMs > 0 && shouldTarget(tool)) {
      await new Promise(r => setTimeout(r, latencyMs));
    }

    // Dry run shortcut for side‑effect tools
    if (dryRun && tool === 'message.send') {
      return { ok: true, status: 200, contentEcho: String(args?.content || '').slice(0, 64) };
    }

    const result = await impl(args);

    // First attempt validation failure injection
    if (forceValidationFail && shouldTarget(tool) && attempt === 1) {
      // Remove required fields or mutate types to break schema intentionally
      if (result && typeof result === 'object') {
        const mutated: any = { ...result };
        // Common schema key is 'ok'; flip or delete it
        if ('ok' in mutated) {
          mutated.ok = 'not-a-boolean'; // invalid type
        } else {
          mutated.ok = 'not-a-boolean';
        }
        // Add marker so analysis can detect injected failures
        mutated.__faultInjected = true;
        return mutated;
      }
      return 'fault-injected-non-object';
    }

    return result;
  };
}

function patchTools() {
  Object.keys(ToolRegistry).forEach(tool => {
    try {
      (ToolRegistry as any)[tool] = wrapTool(tool, (ToolRegistry as any)[tool]);
    } catch {}
  });
}

function patchLLM() {
  if (process.env.FAULT_FORCE_FALLBACK_JSON !== '1') return;
  try {
    // Dynamic require to avoid import cost if unused
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OpenAI = require('openai');
    const proto = OpenAI?.default?.prototype || OpenAI?.prototype;
    if (!proto) return;
    const chat = proto.chat;
    if (!chat || !chat.completions) return;
    const originalCreate = chat.completions.create;
    chat.completions.create = async function (..._args: any[]) {
      return { choices: [{ message: { content: 'This is a deliberately non‑JSON response triggering fallback.' } }] };
    };
    (chat.completions.create as any).__faultPatched = true;
    // Provide restore hook if needed later
    (proto as any).__restoreCreate = () => { chat.completions.create = originalCreate; };
  } catch (err) {
    // Swallow errors; fault injection is optional
  }
}

export function applyFaultInjection() {
  patchTools();
  patchLLM();
}

// Auto‑apply when module imported (opt‑out by setting FAULT_AUTORUN=0)
if (process.env.FAULT_AUTORUN !== '0') {
  applyFaultInjection();
}
