import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { mapError } from './errors';
import { RefusalError, UnreadableResponseError } from './services/claude';

describe('mapError', () => {
  it('maps a request timeout to 504 with an actionable message', () => {
    expect(mapError(new Anthropic.APIConnectionTimeoutError())).toEqual({
      status: 504,
      message: 'The AI took too long to respond. Try a smaller piece of code.',
    });
  });

  it('maps an unreadable response to 502', () => {
    expect(mapError(new UnreadableResponseError('stop_reason: max_tokens'))).toEqual({
      status: 502,
      message: 'The AI returned an unreadable response. Please try again.',
    });
  });

  it('maps a refusal to 502', () => {
    expect(mapError(new RefusalError('cyber'))).toEqual({
      status: 502,
      message: 'The AI declined to process this code.',
    });
  });

  it('maps an authentication failure to 500 without hinting at the key', () => {
    const mapped = mapError(
      new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', undefined as unknown as Headers),
    );
    expect(mapped).toEqual({ status: 500, message: 'The server is not configured correctly.' });
    expect(mapped.message).not.toContain('x-api-key');
  });

  it('maps an upstream rate limit to 429', () => {
    expect(
      mapError(new Anthropic.RateLimitError(429, undefined, 'slow down', undefined as unknown as Headers)),
    ).toEqual({
      status: 429,
      message: 'The AI service is busy. Please try again shortly.',
    });
  });

  it('maps a bad request to 400', () => {
    expect(
      mapError(new Anthropic.BadRequestError(400, undefined, 'bad', undefined as unknown as Headers)),
    ).toEqual({
      status: 400,
      message: 'That request could not be processed.',
    });
  });

  it('maps any other API error to 502', () => {
    expect(
      mapError(new Anthropic.InternalServerError(500, undefined, 'boom', undefined as unknown as Headers)),
    ).toEqual({
      status: 502,
      message: 'The AI service failed to respond.',
    });
  });

  it('maps an unrecognised throw to 500', () => {
    expect(mapError(new Error('something odd'))).toEqual({
      status: 500,
      message: 'Something went wrong.',
    });
  });

  it('never returns the original message to the client', () => {
    expect(mapError(new Error('connection to 10.0.0.4 refused')).message).not.toContain('10.0.0.4');
  });
});
