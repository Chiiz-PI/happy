import { describe, expect, it } from 'vitest';
import { selectAcpPermissionOutcome } from './permissionOptionSelection';

// Option sets captured from real agents (see docs/research/grok-acp-capability-report.md
// for the Grok wire evidence).
const grokShellOptions = [
  { optionId: 'allow-once', name: 'Yes, proceed', kind: 'allow_once' },
  { optionId: 'reject-once', name: 'No, and tell Grok what to do differently', kind: 'reject_once' },
];

const grokEditOptions = [
  { optionId: 'allow-edits-session', name: 'Yes, allow edits for this session', kind: 'allow_always' },
  { optionId: 'allow-once', name: 'Yes, proceed', kind: 'allow_once' },
  { optionId: 'reject-once', name: 'No, and tell Grok what to do differently', kind: 'reject_once' },
];

const geminiOptions = [
  { optionId: 'proceed_once', name: 'Yes, allow once', kind: 'allow_once' },
  { optionId: 'proceed_always', name: 'Yes, allow always', kind: 'allow_always' },
  { optionId: 'cancel', name: 'No (esc)', kind: 'reject_once' },
];

// Older agents (pre-kind ACP revisions) only expose ids/names.
const legacyIdOnlyOptions = [
  { optionId: 'proceed_once', name: 'Allow once' },
  { optionId: 'proceed_always', name: 'Allow always' },
  { optionId: 'cancel', name: 'Cancel' },
];

describe('selectAcpPermissionOutcome', () => {
  describe('Grok option sets', () => {
    it('approves shell commands with allow-once', () => {
      expect(selectAcpPermissionOutcome(grokShellOptions, 'approved')).toEqual({
        outcome: 'selected',
        optionId: 'allow-once',
      });
    });

    it('rejects shell commands with reject-once instead of a nonexistent cancel id', () => {
      expect(selectAcpPermissionOutcome(grokShellOptions, 'denied')).toEqual({
        outcome: 'selected',
        optionId: 'reject-once',
      });
    });

    it('falls back to allow-once when approving for session without an allow_always option', () => {
      expect(selectAcpPermissionOutcome(grokShellOptions, 'approved_for_session')).toEqual({
        outcome: 'selected',
        optionId: 'allow-once',
      });
    });

    it('approves edits for session with allow-edits-session', () => {
      expect(selectAcpPermissionOutcome(grokEditOptions, 'approved_for_session')).toEqual({
        outcome: 'selected',
        optionId: 'allow-edits-session',
      });
    });

    it('approves single edits with allow-once even when allow_always is listed first', () => {
      expect(selectAcpPermissionOutcome(grokEditOptions, 'approved')).toEqual({
        outcome: 'selected',
        optionId: 'allow-once',
      });
    });

    it('rejects edits with reject-once', () => {
      expect(selectAcpPermissionOutcome(grokEditOptions, 'abort')).toEqual({
        outcome: 'selected',
        optionId: 'reject-once',
      });
    });
  });

  describe('Gemini option sets', () => {
    it('approves with proceed_once', () => {
      expect(selectAcpPermissionOutcome(geminiOptions, 'approved')).toEqual({
        outcome: 'selected',
        optionId: 'proceed_once',
      });
    });

    it('approves for session with proceed_always', () => {
      expect(selectAcpPermissionOutcome(geminiOptions, 'approved_for_session')).toEqual({
        outcome: 'selected',
        optionId: 'proceed_always',
      });
    });

    it('rejects with cancel', () => {
      expect(selectAcpPermissionOutcome(geminiOptions, 'denied')).toEqual({
        outcome: 'selected',
        optionId: 'cancel',
      });
    });
  });

  describe('legacy id-only option sets', () => {
    it('approves with proceed_once by id', () => {
      expect(selectAcpPermissionOutcome(legacyIdOnlyOptions, 'approved')).toEqual({
        outcome: 'selected',
        optionId: 'proceed_once',
      });
    });

    it('approves for session with proceed_always by id', () => {
      expect(selectAcpPermissionOutcome(legacyIdOnlyOptions, 'approved_for_session')).toEqual({
        outcome: 'selected',
        optionId: 'proceed_always',
      });
    });

    it('rejects with cancel by id', () => {
      expect(selectAcpPermissionOutcome(legacyIdOnlyOptions, 'denied')).toEqual({
        outcome: 'selected',
        optionId: 'cancel',
      });
    });
  });

  describe('fallback behavior', () => {
    it('approves with the first option when nothing matches', () => {
      const options = [{ optionId: 'weird-yes', name: 'Sure' }];
      expect(selectAcpPermissionOutcome(options, 'approved')).toEqual({
        outcome: 'selected',
        optionId: 'weird-yes',
      });
    });

    it('cancels the request when denying with no reject option available', () => {
      const options = [{ optionId: 'weird-yes', name: 'Sure' }];
      expect(selectAcpPermissionOutcome(options, 'denied')).toEqual({ outcome: 'cancelled' });
    });

    it('cancels the request when no options are provided', () => {
      expect(selectAcpPermissionOutcome([], 'approved')).toEqual({ outcome: 'cancelled' });
      expect(selectAcpPermissionOutcome([], 'denied')).toEqual({ outcome: 'cancelled' });
    });

    it('ignores options without ids', () => {
      const options = [
        { name: 'Allow', kind: 'allow_once' },
        { optionId: 'ok', name: 'OK' },
      ];
      expect(selectAcpPermissionOutcome(options, 'approved')).toEqual({
        outcome: 'selected',
        optionId: 'ok',
      });
    });
  });
});
