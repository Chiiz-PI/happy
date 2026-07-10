import { describe, expect, it } from 'vitest';
import { isClientAcpPermissionMode, resolveClientAutoDecision } from './clientPermissionModes';

describe('isClientAcpPermissionMode', () => {
  it('recognizes the client-enforced modes', () => {
    expect(isClientAcpPermissionMode('default')).toBe(true);
    expect(isClientAcpPermissionMode('acceptEdits')).toBe(true);
    expect(isClientAcpPermissionMode('bypassPermissions')).toBe(true);
    expect(isClientAcpPermissionMode('yolo')).toBe(true);
  });

  it('rejects agent-side or unknown modes', () => {
    expect(isClientAcpPermissionMode('plan')).toBe(false);
    expect(isClientAcpPermissionMode('auto_edit')).toBe(false);
    expect(isClientAcpPermissionMode('')).toBe(false);
  });
});

describe('resolveClientAutoDecision', () => {
  it('approves everything under bypassPermissions and yolo', () => {
    for (const mode of ['bypassPermissions', 'yolo']) {
      expect(resolveClientAutoDecision(mode, 'execute')).toBe('approved');
      expect(resolveClientAutoDecision(mode, 'edit')).toBe('approved');
      expect(resolveClientAutoDecision(mode, 'other')).toBe('approved');
    }
  });

  it('approves only edit tools under acceptEdits', () => {
    expect(resolveClientAutoDecision('acceptEdits', 'edit')).toBe('approved');
    expect(resolveClientAutoDecision('acceptEdits', 'execute')).toBeNull();
    expect(resolveClientAutoDecision('acceptEdits', 'read')).toBeNull();
    expect(resolveClientAutoDecision('acceptEdits', 'other')).toBeNull();
  });

  it('prompts for everything without a mode or under default', () => {
    expect(resolveClientAutoDecision(undefined, 'edit')).toBeNull();
    expect(resolveClientAutoDecision('default', 'edit')).toBeNull();
    expect(resolveClientAutoDecision('default', 'execute')).toBeNull();
  });
});
