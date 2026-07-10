/**
 * Selection of ACP permission response options.
 *
 * Maps Happy permission decisions onto the option list provided by the agent
 * in `session/request_permission`. Options are matched by the standard ACP
 * `PermissionOption.kind` first (`allow_once` / `allow_always` / `reject_once`
 * / `reject_always`), falling back to the legacy id/name heuristics used by
 * agents that predate kinds (e.g. `proceed_once` / `proceed_always` /
 * `cancel`).
 *
 * Denials with no matching reject option resolve to the standard
 * `cancelled` outcome instead of answering with an option id the agent
 * never offered.
 */

export type AcpPermissionDecision = 'approved' | 'approved_for_session' | 'denied' | 'abort';

export type SelectableAcpPermissionOption = {
  optionId?: string;
  name?: string;
  kind?: string;
};

export type AcpPermissionOutcome =
  | { outcome: 'selected'; optionId: string }
  | { outcome: 'cancelled' };

function findByKind(
  options: SelectableAcpPermissionOption[],
  kind: string,
): SelectableAcpPermissionOption | undefined {
  return options.find((opt) => opt.kind === kind && typeof opt.optionId === 'string');
}

function findByIdOrName(
  options: SelectableAcpPermissionOption[],
  id: string,
  nameFragment: string,
): SelectableAcpPermissionOption | undefined {
  return options.find(
    (opt) =>
      typeof opt.optionId === 'string' &&
      (opt.optionId === id || opt.name?.toLowerCase().includes(nameFragment) === true),
  );
}

/**
 * Pick the ACP permission response outcome for a Happy permission decision.
 */
export function selectAcpPermissionOutcome(
  options: SelectableAcpPermissionOption[],
  decision: AcpPermissionDecision,
): AcpPermissionOutcome {
  if (decision === 'denied' || decision === 'abort') {
    const rejectOption =
      findByKind(options, 'reject_once') ??
      findByKind(options, 'reject_always') ??
      findByIdOrName(options, 'cancel', 'cancel');
    if (rejectOption?.optionId) {
      return { outcome: 'selected', optionId: rejectOption.optionId };
    }
    return { outcome: 'cancelled' };
  }

  const preferAlways = decision === 'approved_for_session';
  const allowByKind = preferAlways
    ? findByKind(options, 'allow_always') ?? findByKind(options, 'allow_once')
    : findByKind(options, 'allow_once') ?? findByKind(options, 'allow_always');
  const allowByLegacyId = preferAlways
    ? findByIdOrName(options, 'proceed_always', 'always') ?? findByIdOrName(options, 'proceed_once', 'once')
    : findByIdOrName(options, 'proceed_once', 'once') ?? findByIdOrName(options, 'proceed_always', 'always');
  const firstOption = options.find((opt) => typeof opt.optionId === 'string');

  const allowOption = allowByKind ?? allowByLegacyId ?? firstOption;
  if (allowOption?.optionId) {
    return { outcome: 'selected', optionId: allowOption.optionId };
  }

  // No options at all: approving is impossible, cancel the request.
  return { outcome: 'cancelled' };
}
