/**
 * LLM Gateway Factory
 * Creates the appropriate LLM gateway based on configuration
 */

import type { Config } from '../../config/config.js';
import type { LLMGateway } from '../interfaces.js';
import { StubLLMGateway } from '../stubs.js';
import { OpenAIGateway } from './OpenAIGateway.js';
import { AnthropicGateway } from './AnthropicGateway.js';

export function createLLMGateway(config: Config): LLMGateway {
  const { provider, apiKey, model, maxTokens, temperature } = config.llm;

  switch (provider) {
    case 'openai':
      if (!apiKey) {
        throw new Error(
          'OpenAI API key is required when provider is "openai". Set OPENAI_API_KEY environment variable.'
        );
      }
      return new OpenAIGateway({
        apiKey,
        model,
        maxTokens,
        temperature,
      });

    case 'anthropic':
      if (!apiKey) {
        throw new Error(
          'Anthropic API key is required when provider is "anthropic". Set ANTHROPIC_API_KEY environment variable.'
        );
      }
      return new AnthropicGateway({
        apiKey,
        model,
        maxTokens,
        temperature,
      });

    case 'stub':
    default:
      // Stub gateway for testing (no API key required)
      return new StubLLMGateway();
  }
}
