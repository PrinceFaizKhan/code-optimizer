import {
  OptimizationResultSchema,
  type Language,
  type OptimizationResult,
} from '@code-optimizer/shared';

/** An error whose message is safe to show the user. */
export class ApiError extends Error {}

export async function optimizeCode(
  language: Language,
  code: string,
  signal?: AbortSignal,
): Promise<OptimizationResult> {
  let response: Response;
  try {
    response = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, code }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Is the backend running?');
  }

  if (!response.ok) {
    let message = 'The server returned an unexpected error.';
    try {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
        message = (body as { error: string }).error;
      }
    } catch {
      // Body was not JSON; keep the generic message.
    }
    throw new ApiError(message);
  }

  const parsed = OptimizationResultSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError('The server returned a result this app could not read.');
  }
  return parsed.data;
}
