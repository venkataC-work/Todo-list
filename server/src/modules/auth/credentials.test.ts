import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';
import { createTokenService } from './tokens.js';

describe('password hashing', () => {
  it('verifies the original password and rejects others', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(hash).not.toContain('s3cret-pass');
    await expect(verifyPassword('s3cret-pass', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-pass', hash)).resolves.toBe(false);
  });

  it('salts each hash uniquely', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects malformed stored hashes', async () => {
    await expect(verifyPassword('anything', 'garbage')).resolves.toBe(false);
  });
});

describe('token service', () => {
  const tokens = createTokenService('secret', 60);

  it('round-trips the user id', () => {
    expect(tokens.verify(tokens.sign('user-1'))).toBe('user-1');
  });

  it('rejects tampered, foreign, expired and subject-less tokens', () => {
    const expired = createTokenService('secret', -1).sign('user-1');
    const foreign = createTokenService('other-secret', 60).sign('user-1');
    const noSubject = jwt.sign({}, 'secret');

    [`${tokens.sign('user-1')}x`, foreign, expired, noSubject, 'not-a-jwt'].forEach((token) =>
      expect(tokens.verify(token)).toBeUndefined(),
    );
  });
});
