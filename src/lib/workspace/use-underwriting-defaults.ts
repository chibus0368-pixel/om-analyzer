"use client";

import { useEffect, useState } from "react";
import {
  getUnderwritingDefaults,
  getUnderwritingDefaultsUpdatedAt,
} from "@/lib/firestore/workspaces";
import {
  DEFAULT_UNDERWRITING,
  type UnderwritingDefaults,
} from "@/lib/types/workspace";

/**
 * Load the workspace's standardized underwriting baseline.
 *
 * Returns DEFAULT_UNDERWRITING immediately so components never need to
 * render a loading skeleton for assumption values. `loaded` flips to
 * true once the real workspace values come back from Firestore.
 *
 * Also returns `updatedAt`, the ISO timestamp of the last defaults save,
 * so callers can detect when a persisted score is stale relative to the
 * current baseline and trigger a recalc.
 *
 * IMPORTANT: Callers should use these values, not OM-extracted debt
 * assumptions, whenever the output needs to be comparable across deals
 * (scoring, IRR solve, bid range). OM terms should only be shown as a
 * read-only reference.
 */
export function useUnderwritingDefaults(workspaceId: string | null | undefined): {
  defaults: UnderwritingDefaults;
  loaded: boolean;
  updatedAt: string | null;
} {
  const [defaults, setDefaults] = useState<UnderwritingDefaults>(DEFAULT_UNDERWRITING);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setDefaults({ ...DEFAULT_UNDERWRITING });
      setUpdatedAt(null);
      setLoaded(true);
      return;
    }
    Promise.all([
      getUnderwritingDefaults(workspaceId),
      getUnderwritingDefaultsUpdatedAt(workspaceId),
    ])
      .then(([d, ts]) => {
        if (!cancelled) {
          setDefaults(d);
          setUpdatedAt(ts);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDefaults({ ...DEFAULT_UNDERWRITING });
          setUpdatedAt(null);
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [workspaceId]);

  return { defaults, loaded, updatedAt };
}
