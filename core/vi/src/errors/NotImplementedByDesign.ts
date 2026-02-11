/**
 * NotImplementedByDesign Error
 * Thrown at phase boundaries where a feature is deliberately not yet implemented
 * Follows Section 3 Boundary Policy from copilot-rules.md
 */

export interface NotImplementedContext {
  phase: string;
  reason: string;
  when: string;
  workaround?: string;
  ticket?: string;
}

export class NotImplementedByDesign extends Error {
  public readonly context: NotImplementedContext;

  constructor(message: string, context: NotImplementedContext) {
    const fullMessage = `${message}\n\n` +
      `Phase: ${context.phase}\n` +
      `Reason: ${context.reason}\n` +
      `When: ${context.when}\n` +
      (context.workaround ? `Workaround: ${context.workaround}\n` : '') +
      (context.ticket ? `Ticket: ${context.ticket}\n` : '');

    super(fullMessage);
    this.name = 'NotImplementedByDesign';
    this.context = context;

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotImplementedByDesign);
    }
  }
}
