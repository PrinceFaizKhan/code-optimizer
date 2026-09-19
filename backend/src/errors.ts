import Anthropic from '@anthropic-ai/sdk';
import { RefusalError, UnreadableResponseError } from './services/claude';

export interface MappedError {
  status: number;
  message: string;
}

/**
 * Translates anything thrown while handling a request into a status code and a message
 * that is safe to send to the browser. Internal detail stays in the server log.
 */
export function mapError(error: unknown): MappedError {
  if (error instanceof UnreadableResponseError) {
    return { status: 502, message: 'The AI returned an unreadable response. Please try again.' };
  }
  if (error instanceof RefusalError) {
    return { status: 502, message: 'The AI declined to process this code.' };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return { status: 500, message: 'The server is not configured correctly.' };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: 'The AI service is busy. Please try again shortly.' };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { status: 400, message: 'That request could not be processed.' };
  }
  if (error instanceof Anthropic.APIError) {
    return { status: 502, message: 'The AI service failed to respond.' };
  }
  return { status: 500, message: 'Something went wrong.' };
}
