import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveProfileIdentity } from './profile-identity.ts';
import {
  getStoredProfileSnapshot,
  isDeveloperOverrideEmail,
  prepareProfileImageForStorage,
  resolveProfileEditorState,
  writeStoredProfile,
} from '../community-access.ts';

test('resolveProfileIdentity prefers saved profile identity over auth defaults', () => {
  const result = resolveProfileIdentity(
    {
      displayName: 'auth-name',
      primaryEmail: 'auth@example.com',
      profileImageUrl: 'https://auth.example/avatar.png',
    },
    {
      displayName: 'profile-username',
      primaryEmail: 'profile@example.com',
      profileImageUrl: 'https://profile.example/avatar.png',
    },
  );

  assert.equal(result.displayName, 'profile-username');
  assert.equal(result.username, null);
  assert.equal(result.primaryEmail, 'auth@example.com');
  assert.equal(result.profileImageUrl, 'https://profile.example/avatar.png');
});

test('resolveProfileIdentity prefers canonical username and never uses email as a display name', () => {
  const result = resolveProfileIdentity(
    {
      displayName: 'person@example.com',
      primaryEmail: 'person@example.com',
      profileImageUrl: null,
    },
    {
      username: 'brew_builder',
      displayName: 'person@example.com',
      primaryEmail: 'person@example.com',
      profileImageUrl: 'https://cdn.example.com/avatar.png',
    },
  );

  assert.equal(result.username, 'brew_builder');
  assert.equal(result.displayName, 'brew_builder');
  assert.equal(result.primaryEmail, 'person@example.com');
  assert.equal(result.profileImageUrl, 'https://cdn.example.com/avatar.png');
});

test('resolveProfileIdentity uses a neutral label when auth only supplies an email', () => {
  const result = resolveProfileIdentity({
    displayName: 'person@example.com',
    primaryEmail: 'person@example.com',
  });

  assert.equal(result.displayName, 'Community Member');
});

test('resolveProfileIdentity does not display an email stored as a legacy username', () => {
  const result = resolveProfileIdentity(
    { primaryEmail: 'person@example.com' },
    { username: 'person@example.com', displayName: 'person@example.com' },
  );

  assert.equal(result.username, null);
  assert.equal(result.displayName, 'Community Member');
});

test('resolveProfileIdentity falls back to auth data when no saved profile exists', () => {
  const result = resolveProfileIdentity({
    displayName: 'auth-name',
    primaryEmail: 'auth@example.com',
    profileImageUrl: 'https://auth.example/avatar.png',
  });

  assert.equal(result.displayName, 'auth-name');
  assert.equal(result.primaryEmail, 'auth@example.com');
  assert.equal(result.profileImageUrl, 'https://auth.example/avatar.png');
});

test('prepareProfileImageForStorage compresses large avatar data URLs to a safe size', () => {
  const huge = 'data:image/png;base64,' + 'A'.repeat(2_000_000);
  const prepared = prepareProfileImageForStorage(huge);

  assert.ok(prepared.startsWith('data:image'));
  assert.ok(prepared.length < huge.length);
  assert.ok(prepared.length <= 350_000);
});

test('getStoredProfileSnapshot keeps a stable reference when the saved profile is unchanged', () => {
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      store: JSON.stringify({ displayName: 'alice', primaryEmail: 'alice@example.com', profileImageUrl: 'https://example.com/alice.png' }),
      getItem(key: string) {
        return key === 'agent-brew-profile' ? this.store : null;
      },
      setItem(_key: string, value: string) {
        this.store = value;
      },
      removeItem() {},
    },
    configurable: true,
    writable: true,
  });

  const first = getStoredProfileSnapshot();
  const second = getStoredProfileSnapshot();

  assert.equal(first, second);

  Object.defineProperty(globalThis, 'localStorage', {
    value: previous,
    configurable: true,
    writable: true,
  });
});

test('resolveProfileEditorState keeps an in-progress draft instead of overwriting it with the saved profile', () => {
  const result = resolveProfileEditorState(
    { displayName: 'old-name', primaryEmail: 'old@example.com', profileImageUrl: 'https://old.example/avatar.png' },
    { displayName: 'saved-name', primaryEmail: 'saved@example.com', profileImageUrl: 'https://saved.example/avatar.png' },
    { displayName: 'draft-name', primaryEmail: 'draft@example.com', profileImageUrl: 'https://draft.example/avatar.png' },
  );

  assert.equal(result.displayName, 'draft-name');
  assert.equal(result.primaryEmail, 'draft@example.com');
  assert.equal(result.profileImageUrl, 'https://draft.example/avatar.png');
});

test('isDeveloperOverrideEmail grants the configured developer email full room access', () => {
  assert.equal(isDeveloperOverrideEmail('aprizal.ingkajaya@gmail.com'), true);
  assert.equal(isDeveloperOverrideEmail('APRIZAL.INGKAJAYA@GMAIL.COM'), true);
  assert.equal(isDeveloperOverrideEmail('someone@example.com'), false);
});

test('writeStoredProfile does not throw when localStorage quota is exceeded', () => {
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      setItem() {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      },
      removeItem() {},
      getItem() {
        return null;
      },
    },
    configurable: true,
    writable: true,
  });

  assert.doesNotThrow(() => {
    writeStoredProfile({
      displayName: 'alice',
      primaryEmail: 'alice@example.com',
      profileImageUrl: 'data:image/png;base64,AAAA',
    });
  });

  Object.defineProperty(globalThis, 'localStorage', {
    value: previous,
    configurable: true,
    writable: true,
  });
});
