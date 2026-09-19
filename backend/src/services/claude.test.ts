import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import type { OptimizationResult } from '@code-optimizer/shared';
import type { AppConfig } from '../config';
import { createCodeOptimizer, RefusalError, UnreadableResponseError } from './claude';

const config: AppConfig = {
  anthropicApiKey: 'sk-test',
  port: 3001,
  model: 'claude-opus-5',
  maxCodeChars: 60_000,
};

const result: OptimizationResult = {
  optimized_code: 'const x = 1;',
  quality_score: 80,
  no_optimization_needed: false,
  summary: 'Tightened it up.',
  issues_found: [],
  performance_improvements: [],
  potential_bugs: [],
  explanation_of_changes: [],
};

function fakeClient(response: unknown) {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

function fakeClientRejecting(error: unknown) {
  const parse = vi.fn().mockRejectedValue(error);
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

describe('createCodeOptimizer', () => {
  it('sends a 32000-token request through the real SDK without the implicit timeout guard rejecting it', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: config.model,
        content: [{ type: 'text', text: JSON.stringify(result) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
      }), { headers: { 'Content-Type': 'application/json' } }),
    );
    const client = new Anthropic({ apiKey: 'sk-test', fetch: transport });

    await expect(createCodeOptimizer(config, client).optimize('typescript', 'const x=1'))
      .resolves.toEqual(result);
    expect(transport).toHaveBeenCalledTimes(1);
    const body = JSON.parse(transport.mock.calls[0]![1]!.body as string);
    expect(body.max_tokens).toBe(32_000);
  });

  it('returns the parsed output on success', async () => {
    const { client } = fakeClient({ stop_reason: 'end_turn', parsed_output: result });
    const optimizer = createCodeOptimizer(config, client);
    await expect(optimizer.optimize('typescript', 'const x=1')).resolves.toEqual(result);
  });

  it('sends the configured model, the system prompt, and the fenced code', async () => {
    const { client, parse } = fakeClient({ stop_reason: 'end_turn', parsed_output: result });
    await createCodeOptimizer(config, client).optimize('python', 'print(1)');

    const request = parse.mock.calls[0]![0];
    expect(request.model).toBe('claude-opus-5');
    expect(request.max_tokens).toBe(32_000);
    expect(request.system).toContain('Preserve the original functionality');
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe('user');
    expect(request.messages[0].content).toContain('```python\nprint(1)\n```');
    expect(request.output_config.effort).toBe('high');
    expect(request.output_config.format).toBeDefined();
  });

  it('uses the model from config rather than a hardcoded one', async () => {
    const { client, parse } = fakeClient({ stop_reason: 'end_turn', parsed_output: result });
    await createCodeOptimizer({ ...config, model: 'claude-sonnet-5' }, client).optimize('sql', 'SELECT 1');
    expect(parse.mock.calls[0]![0].model).toBe('claude-sonnet-5');
  });

  it('throws UnreadableResponseError when parsed_output is null', async () => {
    const { client } = fakeClient({ stop_reason: 'max_tokens', parsed_output: null });
    await expect(createCodeOptimizer(config, client).optimize('php', '<?php echo 1;')).rejects.toBeInstanceOf(
      UnreadableResponseError,
    );
  });

  it('throws RefusalError when the model declines', async () => {
    const { client } = fakeClient({
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: 'declined' },
      parsed_output: null,
    });
    await expect(createCodeOptimizer(config, client).optimize('php', 'x')).rejects.toBeInstanceOf(RefusalError);
  });

  it('does not put the API key into any thrown message', async () => {
    const { client } = fakeClient({ stop_reason: 'max_tokens', parsed_output: null });
    await expect(createCodeOptimizer(config, client).optimize('php', 'x')).rejects.toSatisfy(
      (err: Error) => !err.message.includes('sk-test'),
    );
  });

  it('converts an AnthropicError thrown by parse() (schema-invalid output) into UnreadableResponseError', async () => {
    const { client } = fakeClientRejecting(
      new Anthropic.AnthropicError('Failed to parse structured output: invalid enum value'),
    );
    await expect(createCodeOptimizer(config, client).optimize('php', 'x')).rejects.toBeInstanceOf(
      UnreadableResponseError,
    );
  });

  it('rethrows an APIError (e.g. AuthenticationError) thrown by parse() unchanged, NOT as UnreadableResponseError', async () => {
    const authError = new Anthropic.AuthenticationError(
      401,
      undefined,
      'invalid x-api-key',
      undefined as unknown as Headers,
    );
    const { client } = fakeClientRejecting(authError);
    const promise = createCodeOptimizer(config, client).optimize('php', 'x');
    await expect(promise).rejects.toBe(authError);
    await expect(promise).rejects.toBeInstanceOf(Anthropic.AuthenticationError);
  });
});
