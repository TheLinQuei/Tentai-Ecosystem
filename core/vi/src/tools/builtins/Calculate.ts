/**
 * Calculate: Safe math operations
 */

import { Tool, JSONSchema } from '../types.js';

const calculateSchema: JSONSchema = {
  type: 'object',
  properties: {
    expression: {
      type: 'string',
      description: 'Math expression (e.g., "2 + 2", "sqrt(16)", "sin(0)"))',
    },
  },
  required: ['expression'],
};

/**
 * Safe mathematical evaluation.
 * Only allows safe functions and operators.
 */
function safeEval(expr: string): number {
  // Whitelist allowed functions
  const allowedFunctions = ['Math', 'sqrt', 'sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round'];
  const allowedOperators = ['+', '-', '*', '/', '%', '(', ')', ' ', '.', ','];
  const allowedDigits = '0123456789';

  // Check for disallowed characters
  for (const char of expr) {
    if (
      !allowedDigits.includes(char) &&
      !allowedOperators.includes(char) &&
      !/[a-zA-Z_]/.test(char)
    ) {
      throw new Error(`Disallowed character: ${char}`);
    }
  }

  // Replace Math.function calls with direct function calls
  let safeExpr = expr.replace(/Math\./g, '');

  // Validate allowed functions
  for (const func of safeExpr.match(/[a-zA-Z_]\w*/g) || []) {
    if (!allowedFunctions.includes(func) && isNaN(Number(func))) {
      throw new Error(`Disallowed function: ${func}`);
    }
  }

  // Create safe context
  const context = {
    Math,
    sqrt: Math.sqrt,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
  };

  // Evaluate in safe context
  try {
    const result = Function(...Object.keys(context), `return ${safeExpr}`)(
      ...Object.values(context)
    ) as number;
    return result;
  } catch (error) {
    throw new Error(`Evaluation error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const CalculateTool: Tool = {
  name: 'calculate',
  category: 'compute',
  version: '1.0.0',
  description: 'Perform mathematical calculations',
  longDescription:
    'Safely evaluates mathematical expressions. Supports basic operations (+, -, *, /, %) and Math functions (sqrt, sin, cos, tan, abs, floor, ceil, round).',
  examples: [
    {
      input: { expression: '2 + 2' },
      output: { result: 4, expression: '2 + 2' },
    },
    {
      input: { expression: 'sqrt(16)' },
      output: { result: 4, expression: 'sqrt(16)' },
    },
  ],
  inputSchema: calculateSchema,
  permissions: [],
  rateLimit: { callsPerMinute: 1000 },
  cost: { creditsPerExecution: 0 },
  timeout: { milliseconds: 1000 },
  isEnabled: true,

  async execute(parameters: Record<string, unknown>): Promise<any> {
    const expression = parameters.expression as string;

    if (!expression || typeof expression !== 'string') {
      throw new Error('expression parameter is required and must be a string');
    }

    const result = safeEval(expression);

    return {
      result,
      expression,
      type: typeof result,
    };
  },
};
