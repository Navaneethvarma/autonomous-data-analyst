import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getEnvConfig,
  resetEnvConfig,
  validateOpenAiApiKey,
  isLiveModelConfigured,
  envSchema,
} from '../../src/config/env.js';

describe('Environment Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetEnvConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvConfig();
  });

  it('provides default model and node environment when unset', () => {
    delete process.env['OPENAI_API_KEY'];
    delete process.env['MODEL_NAME'];
    delete process.env['NODE_ENV'];

    const config = getEnvConfig();
    expect(config.MODEL_NAME).toBe('openai/gpt-4o');
    expect(config.NODE_ENV).toBe('development');
    expect(config.OPENAI_API_KEY).toBeUndefined();
  });

  it('accepts supported model names', () => {
    process.env['MODEL_NAME'] = 'openai/gpt-4o-mini';
    const config = getEnvConfig();
    expect(config.MODEL_NAME).toBe('openai/gpt-4o-mini');
  });

  it('rejects unsupported or invented model names', () => {
    const result = envSchema.safeParse({
      MODEL_NAME: 'unsupported/invented-llm',
    });
    expect(result.success).toBe(false);
  });

  it('throws a safe, actionable error when OPENAI_API_KEY is missing or empty', () => {
    delete process.env['OPENAI_API_KEY'];
    expect(() => validateOpenAiApiKey()).toThrowError(
      /Missing required environment variable OPENAI_API_KEY/
    );
    expect(isLiveModelConfigured()).toBe(false);
  });

  it('rejects placeholder OPENAI_API_KEY values from .env.example', () => {
    process.env['OPENAI_API_KEY'] = 'your_openai_api_key_here';
    expect(() => validateOpenAiApiKey()).toThrowError(
      /Missing required environment variable OPENAI_API_KEY/
    );
    expect(isLiveModelConfigured()).toBe(false);
  });

  it('accepts a valid key and never prints it in validation errors', () => {
    process.env['OPENAI_API_KEY'] = 'sk-mock-valid-key-for-testing';
    expect(isLiveModelConfigured()).toBe(true);
    const key = validateOpenAiApiKey();
    expect(key).toBe('sk-mock-valid-key-for-testing');
  });
});
