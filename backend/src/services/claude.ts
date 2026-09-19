import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { OptimizationResultSchema, type Language, type OptimizationResult } from '@code-optimizer/shared';
import type { AppConfig } from '../config';
import { buildSystemPrompt, buildUserMessage } from '../prompt';

/** The model produced no schema-valid payload. */
export class UnreadableResponseError extends Error {
  constructor(reason: string) {
    super(`Claude returned no usable result (${reason}).`);
    this.name = 'UnreadableResponseError';
  }
}

/** The model declined to process the request. */
export class RefusalError extends Error {
  constructor(reason: string) {
    super(`Claude declined the request (${reason}).`);
    this.name = 'RefusalError';
  }
}

export interface CodeOptimizer {
  optimize(language: Language, code: string): Promise<OptimizationResult>;
}

export function createCodeOptimizer(
  config: AppConfig,
  client: Anthropic = new Anthropic({ apiKey: config.anthropicApiKey }),
): CodeOptimizer {
  return {
    async optimize(language, code) {
      let response;
      try {
        response = await client.messages.parse({
          model: config.model,
          max_tokens: 32_000,
          system: buildSystemPrompt(language),
          messages: [{ role: 'user', content: buildUserMessage(language, code) }],
          output_config: {
            format: zodOutputFormat(OptimizationResultSchema),
            effort: 'high',
          },
        });
      } catch (error) {
        // The SDK throws (rather than returning a null `parsed_output`) when the
        // model's response violates the Zod schema. That failure is an
        // `AnthropicError`, but NOT an `APIError` (APIError extends
        // AnthropicError, not the reverse) — so it must be converted here to a
        // domain error, or it will slip past Task 5's `instanceof APIError`
        // error-mapping chain and surface as a generic 500 instead of the
        // documented 502. Real transport/API failures (APIError and its
        // subclasses, e.g. AuthenticationError) are rethrown unchanged so Task 5
        // can classify them by status.
        if (error instanceof Anthropic.APIError) {
          throw error;
        }
        if (error instanceof Anthropic.AnthropicError) {
          throw new UnreadableResponseError(error.message);
        }
        throw error;
      }

      if (response.stop_reason === 'refusal') {
        throw new RefusalError(response.stop_details?.category ?? 'no category given');
      }
      if (!response.parsed_output) {
        throw new UnreadableResponseError(`stop_reason: ${response.stop_reason}`);
      }
      return response.parsed_output;
    },
  };
}
