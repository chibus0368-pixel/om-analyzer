"use client";

import { useEffect, useState } from "react";
import { getUnderwritingDefaults } from "@/lib/firestore/workspaces";
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
 * IMPORTANT: Callers should use these values, not OM-extracted debt
 * assumptions, whenever the output needs to be comparable across deals
 * (scoring, IRR solve, bid range). OM terms should only be shown as a
 * read-only reference.
 */
export function useUnderwritingDefaults(workspaceId: string | null | undefined): {
  defaults: UnderwritingDefaults;
  loaded: boolean;
} {
  const [defaults, setDefaults] = useState<UnderwritingDefaults>(DEFAULT_UNDERWRITING);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setDefaults({ ...DEFAULT_UNDERWRITING });
      setLoaded(true);
      return;
    }
    getUnderwritingDefaults(workspaceId)
      .then(d => {
        if (!cancelled) {
          setDefaults(d);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDefaults({ ...DEFAULT_UNDERWRITING });
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [workspaceId]);

  return { defaults, loaded };
}
