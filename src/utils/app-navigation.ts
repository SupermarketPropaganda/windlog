import { ActiveView } from '../types';

export function viewFromHash(hash: string): ActiveView {
  if (new URLSearchParams(hash.replace(/^#/, '')).has('route')) return 'navlog';
  switch (hash.toLowerCase()) {
    case '#navlog': case '#cockpit': return 'navlog';
    case '#saved-flights': return 'saved-flights';
    case '#mass-balance': return 'mass-balance';
    case '#runway-wind': return 'runway-wind';
    case '#profile': case '#account': case '#security': return 'auth';
    default: return 'landing';
  }
}
