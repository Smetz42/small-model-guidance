import type { GuidanceBinding } from './config.js';

/**
 * Whether one guidance binding applies to an agent with this provider route
 * and model id. The model id must be listed exactly; a route pin additionally
 * requires the provider route to match, while an unpinned binding follows the
 * model on any route. Missing identity never matches.
 */
export function matchesBinding(
  binding: GuidanceBinding,
  provider: string | undefined,
  model: string | undefined,
): boolean {
  if (model === undefined || !binding.models.includes(model)) return false;
  if (binding.route !== undefined && binding.route !== provider) return false;
  return true;
}
