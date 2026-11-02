import { describe, it, expect } from 'vitest';
import { scrubSensitiveString, scrubSensitiveData } from '../credentialScrubber';

describe('Credential & Secret Scrubber Service', () => {
  it('correctly fixes capture group replacements without literal $1 output', () => {
    const text1 = 'password: MySuperSecretPassword123!';
    const scrubbed1 = scrubSensitiveString(text1);
    expect(scrubbed1).toBe('password: [REDACTED]');
    expect(scrubbed1).not.toContain('$1');
    expect(scrubbed1).not.toContain('MySuperSecretPassword123!');

    const text2 = 'apiKey="secret-key-value-here"';
    const scrubbed2 = scrubSensitiveString(text2);
    expect(scrubbed2).toBe('apiKey="[REDACTED]"');

    const text3 = 'client_secret = \'some_client_secret_999\'';
    const scrubbed3 = scrubSensitiveString(text3);
    expect(scrubbed3).toBe('client_secret = \'[REDACTED]\'');
  });

  it('redacts OpenAI API keys (both legacy and sk-proj formats)', () => {
    const raw = 'Configured key is sk-proj-abc12345678901234567890xyz and old sk-abc12345678901234567890xyz';
    const result = scrubSensitiveString(raw);
    expect(result).not.toContain('abc12345678901234567890xyz');
    expect(result).toContain('[REDACTED_OPENAI_KEY]');
  });

  it('redacts Anthropic Claude API keys', () => {
    const raw = 'Claude token sk-ant-api03-abcdef1234567890abcdef1234567890 is active';
    const result = scrubSensitiveString(raw);
    expect(result).not.toContain('abcdef1234567890');
    expect(result).toContain('[REDACTED_ANTHROPIC_KEY]');
  });

  it('redacts Google Gemini AIza API keys', () => {
    const raw = 'Gemini key: AIzaSyA1234567890abcdefghijklmnopqrstuv';
    const result = scrubSensitiveString(raw);
    expect(result).not.toContain('AIzaSyA1234567890abcdefghijklmnopqrstuv');
    expect(result).toContain('[REDACTED_GEMINI_KEY]');
  });

  it('redacts GitHub personal access tokens', () => {
    const ghp = 'GitHub ghp_123456789012345678901234567890123456';
    const pat = 'github_pat_11ABCDEFG012345678901234567890_abcdefghijklmnopqrstuvwxyz';
    expect(scrubSensitiveString(ghp)).toContain('[REDACTED_GITHUB_KEY]');
    expect(scrubSensitiveString(pat)).toContain('[REDACTED_GITHUB_KEY]');
  });

  it('redacts Authorization Bearer tokens', () => {
    const auth = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
    const result = scrubSensitiveString(auth);
    expect(result).toBe('Authorization: Bearer [REDACTED_TOKEN]');
  });

  it('redacts multiline PEM private keys', () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y+3z
randomBase64DataLine1
randomBase64DataLine2==
-----END RSA PRIVATE KEY-----`;
    const result = scrubSensitiveString(pem);
    expect(result).toBe('[REDACTED_PRIVATE_KEY]');
    expect(result).not.toContain('randomBase64DataLine1');
  });

  it('recursively scrubs nested JSON objects and arrays', () => {
    const nestedPayload = {
      user: 'alice',
      credentials: {
        password: 'TopSecretPassword',
        apiKey: 'sk-proj-12345678901234567890abcdef',
        metadata: {
          auth_token: 'raw-token-value',
          tokens: ['Bearer secret_token_1234567890', 'normal-value'],
        },
      },
    };

    const scrubbed = scrubSensitiveData(nestedPayload) as typeof nestedPayload;
    expect(scrubbed.credentials.password).toBe('[REDACTED]');
    expect(scrubbed.credentials.apiKey).toBe('[REDACTED]');
    expect(scrubbed.credentials.metadata.auth_token).toBe('[REDACTED]');
    expect(scrubbed.credentials.metadata.tokens[0]).toBe('Bearer [REDACTED_TOKEN]');
    expect(scrubbed.credentials.metadata.tokens[1]).toBe('normal-value');
  });

  it('scrubs Error message and stack traces', () => {
    const err = new Error('Database connection failed with password: SecretDBPassword123');
    const scrubbedErr = scrubSensitiveData(err);
    expect(scrubbedErr.message).toBe('Database connection failed with password: [REDACTED]');
    expect(scrubbedErr.stack).not.toContain('SecretDBPassword123');
  });
});
