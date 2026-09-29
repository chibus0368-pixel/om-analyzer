import { getAdminDb } from "@/lib/firebase-admin";
import { COLL } from "./server";
import { loadContacts } from "./contacts";
import { processDrips, processScheduledBroadcasts } from "./campaigns";
import { processSocialQueue } from "./social";

/** One pass of the marketing scheduler: due broadcasts, drip steps, social posts. */
export async function runMarketing(trigger: string) {
  const started = new Date().toISOString();
  const result: any = { trigger, started };
  try { result.social = await processSocialQueue(); } catch (e: any) { result.socialError = e?.message; }
  try {
    const contacts = await loadContacts();
    result.contacts = contacts.length;
    result.broadcasts = await processScheduledBroadcasts(contacts);
    result.drips = await processDrips(contacts);
  } catch (e: any) { result.emailError = e?.message; }
  result.finished = new Date().toISOString();
  try { await getAdminDb().collection(COLL.runs).doc("latest").set(result); } catch { /* best effort */ }
  return result;
}
