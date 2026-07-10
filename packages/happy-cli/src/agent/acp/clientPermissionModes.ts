/**
 * Client-side permission modes for generic ACP agents.
 *
 * Some ACP agents (e.g. Grok Build) expose no agent-side approval modes:
 * no standard `modes`/`configOptions`, `session/set_config_option` is
 * unimplemented, and permission-related launch flags are ignored in agent
 * stdio mode. Their permission requests are answered by Happy, so
 * accept-edits and bypass behavior can be enforced client-side by
 * auto-answering requests instead of prompting the user.
 *
 * These modes are a fallback: when the agent advertises its own ACP
 * permission modes, those take precedence and this module is not consulted.
 */

const CLIENT_ACP_PERMISSION_MODES = new Set(['default', 'acceptEdits', 'bypassPermissions', 'yolo']);

export function isClientAcpPermissionMode(mode: string): boolean {
  return CLIENT_ACP_PERMISSION_MODES.has(mode);
}

/**
 * Decide whether a permission request can be auto-approved under the given
 * client-side mode. `toolName` is the ACP tool kind for generic ACP agents
 * (`edit`, `execute`, `read`, ...). Returns null when the user must be
 * prompted.
 */
export function resolveClientAutoDecision(
  mode: string | undefined,
  toolName: string,
): 'approved' | null {
  if (mode === 'bypassPermissions' || mode === 'yolo') {
    return 'approved';
  }
  if (mode === 'acceptEdits' && toolName === 'edit') {
    return 'approved';
  }
  return null;
}
