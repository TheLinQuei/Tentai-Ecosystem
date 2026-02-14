declare module '@vi/prompts' {
  export type PromptInput = any;
  export type PromptOutput = any;
  export type ContextItem = any;
  export type EmotionTone = 'curious' | 'playful' | 'serious' | 'empathetic' | string;

  export function composePrompt(input: PromptInput): PromptOutput;
  export function calculateContextWeight(recency: number, relevance: number, bias?: number): number;
  export function generatePromptId(): string;
  export function createMetrics(...args: any[]): any;
  export function logPromptMetrics(metrics: any): Promise<void>;
}