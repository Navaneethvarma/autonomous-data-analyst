import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env if present
dotenv.config();

const SUPPORTED_MODELS = [
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/o1',
  'openai/o3-mini',
] as const;

export type SupportedModel = typeof SUPPORTED_MODELS[number];

/**
 * Schema for environment variables.
 * Note: OPENAI_API_KEY is optional at import time so that static inspection,
 * registration, schema generation, and offline unit tests run without failing.
 * Live calls or explicit initialization validate the presence of OPENAI_API_KEY.
 */
export const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is empty').optional(),
  MODEL_NAME: z.enum(SUPPORTED_MODELS).default('openai/gpt-4o'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATASETS_DIR: z.string().default('./datasets'),
  MAX_DATASET_SIZE_MB: z.coerce.number().positive().default(50),
  /**
   * Execution isolation mode for Python analytics:
   * - 'restricted_subprocess': Developer workstation restricted subprocess with AST inspection and secret scrubbing.
   * - 'strict_container_only': Production mode requiring an isolated container sandbox; rejects untrusted execution if container sandbox is not active.
   */
  PYTHON_SANDBOX_MODE: z.enum(['restricted_subprocess', 'strict_container_only']).default('restricted_subprocess'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedConfig: EnvConfig | null = null;

/**
 * Retrieves the parsed environment configuration.
 */
export function getEnvConfig(): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map(err => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`Invalid environment configuration: ${errorDetails}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Resets the cached environment configuration (primarily used in tests).
 */
export function resetEnvConfig(): void {
  cachedConfig = null;
}

/**
 * Validates that the OpenAI API key is present and configured.
 * Throws a sanitized, actionable error if missing, without leaking secrets.
 */
export function validateOpenAiApiKey(): string {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_openai_api_key_here') {
    throw new Error(
      'Missing required environment variable OPENAI_API_KEY. ' +
      'Please copy .env.example to .env and set your valid OpenAI API key before executing live model calls.'
    );
  }
  return apiKey;
}

/**
 * Checks whether live model calling is configured.
 */
export function isLiveModelConfigured(): boolean {
  try {
    validateOpenAiApiKey();
    return true;
  } catch {
    return false;
  }
}
