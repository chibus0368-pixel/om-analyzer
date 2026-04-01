import { collection, addDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { getDb } from "./firebase";

export interface SubscribeResult {
  success: boolean;
  message: string;
  alreadySubscribed?: boolean;
}

export async function subscribeEmail(
  email: string,
  source: string = "homepage",
  utmSource?: string,
  utmMedium?: string,
  utmCampaign?: string
): Promise<SubscribeResult> {
  const db = getDb();

  // Check if email already exists
  const q = query(collection(db, "subscribers"), where("email", "==", email.toLowerCase().trim()));
  const existing = await getDocs(q);

  if (!existing.empty) {
    const data = existing.docs[0].data();
    if (data.status === "confirmed") {
      return { success: true, message: "You're already subscribed!", alreadySubscribed: true };
    }
    if (data.status === "pending") {
      return { success: true, message: "Please check your email to confirm your subscription.", alreadySubscribed: true };
    }
  }

  // Create new subscriber
  await addDoc(collection(db, "subscribers"), {
    email: email.toLowerCase().trim(),
    status: "pending",
    interests: [],
    frequency: "daily",
    createdAt: serverTimestamp(),
    confirmedAt: null,
    source,
    utmSource: utmSource || null,
    utmMedium: utmMedium || null,
    utmCampaign: utmCampaign || null,
  });

  // TODO: Trigger double opt-in confirmation email via Cloud Function

  return { success: true, message: "Check your inbox to confirm your subscription!" };
}
