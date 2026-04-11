"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential, type User } from "firebase/auth";
import { requestPasswordReset } from "@/lib/auth/providers";
import { PLANS } from "@/lib/stripe/config";

/* ── Design tokens ── */
const PRIMARY = "#84CC16";
const SURFACE = "#151b2b";
const MUTED = "#585e70";
const BG = "#faf8ff";
const BORDER = "#EDF0F5";
const INPUT_BORDER = "#D8DFE9";

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 8, border: `1px solid ${BORDER}`,
  padding: "24px 28px", marginBottom: 20,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#253352", display: "block", marginBottom: 5,
  fontFamily: "'Inter', sans-serif",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: `1.5px solid ${INPUT_BORDER}`,
  borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box",
  fontFamily: "'Inter', sans-serif", transition: "border-color 0.15s",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, background: "#fff", cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 28px", background: SURFACE, color: "#fff",
  border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "'Inter', sans-serif", transition: "all 0.15s",
};

const btnOutline: React.CSSProperties = {
  padding: "10px 20px", background: "transparent", color: MUTED,
  border: `1px solid ${INPUT_BORDER}`, borderRadius: 6, fontSize: 13,
  fontWeight: 500, cursor: "pointer", fontFamily: "'Inter', sans-serif",
  transition: "all 0.15s",
};

const btnDanger: React.CSSProperties = {
  padding: "10px 20px", background: "transparent", color: "#DC2626",
  border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: 6, fontSize: 13,
  fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif",
  transition: "all 0.15s",
};

const ROLE_OPTIONS = [
  { value: "", label: "Select your role" },
  { value: "broker", label: "Broker" },
  { value: "investor", label: "Investor" },
  { value: "analyst", label: "Analyst" },
  { value: "lender", label: "Lender" },
  { value: "operator", label: "Operator" },
  { value: "other", label: "Other" },
];

interface ProfileData {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  company: string;
  role: string;
  jobTitle: string;
  phone: string;
  bio: string;
  marketFocus: string;
  assetFocus: string;
  authProviders: string[];
  primaryProvider: string;
  tier: string;
  tierStatus: string;
  accountStatus: string;
  createdAt: any;
  emailVerified: boolean;
}

interface PrefsData {
  theme: string;
  dateFormat: string;
  emailNotifications: {
    productUpdates: boolean;
    onboardingEmails: boolean;
    newsletter: boolean;
    accountSummary: boolean;
  };
}

const DEFAULT_PREFS: PrefsData = {
  theme: "light",
  dateFormat: "MM/DD/YYYY",
  emailNotifications: {
    productUpdates: false,
    onboardingEmails: true,
    newsletter: false,
    accountSummary: true,
  },
};

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Profile fields
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [prefs, setPrefs] = useState<PrefsData>(DEFAULT_PREFS);

  // Subscription management
  const [usageData, setUsageData] = useState<{ uploadsUsed: number; uploadLimit: number; tier: string; stripeSubscriptionId?: string } | null>(null);
  const [billingLoading, setBillingLoading] = useState<string | null>(null);

  // Editable fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [marketFocus, setMarketFocus] = useState("");
  const [assetFocus, setAssetFocus] = useState("");

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState(DEFAULT_PREFS.emailNotifications);

  // Active section for mobile-friendly tabs — read from ?tab= query param
  const tabParam = searchParams.get("tab");
  const initialTab = (tabParam === "account" || tabParam === "security" || tabParam === "notifications") ? tabParam : "profile";
  const [activeSection, setActiveSection] = useState<"profile" | "security" | "notifications" | "account">(initialTab);

  // Listen for auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Fetch profile when user is available
  const fetchProfile = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/auth/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch profile");
      const data = await res.json();

      if (data.userDoc) {
        setProfile(data.userDoc);
        setFirstName(data.userDoc.firstName || "");
        setLastName(data.userDoc.lastName || "");
        setCompany(data.userDoc.company || "");
        setRole(data.userDoc.role || "");
        setJobTitle(data.userDoc.jobTitle || "");
        setPhone(data.userDoc.phone || "");
        setBio(data.userDoc.bio || "");
        setMarketFocus(data.userDoc.marketFocus || "");
        setAssetFocus(data.userDoc.assetFocus || "");
      }

      if (data.preferences?.emailNotifications) {
        setNotifPrefs(data.preferences.emailNotifications);
        setPrefs(data.preferences);
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Fetch usage/subscription data
  const fetchUsage = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/workspace/usage", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsageData(data);
      }
    } catch { /* non-blocking */ }
  }, [firebaseUser]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Handle Stripe checkout for upgrade
  const handleUpgradeCheckout = async (plan: string) => {
    if (!firebaseUser) return;
    setBillingLoading(plan);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to start checkout");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setBillingLoading(null);
    }
  };

  // Open Stripe Customer Portal for managing subscription
  const handleManageBilling = async () => {
    if (!firebaseUser) return;
    setBillingLoading("portal");
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Unable to open billing portal");
      }
    } catch (err) {
      console.error("Portal error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setBillingLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!firebaseUser) return;
    if (!confirm("Are you sure you want to cancel your subscription? You'll keep access until the end of your current billing period.")) return;
    setBillingLoading("cancel");
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const endDate = data.currentPeriodEnd ? new Date(data.currentPeriodEnd * 1000).toLocaleDateString() : "your billing period ends";
        alert(`Subscription cancelled. You'll have access until ${endDate}.`);
        window.dispatchEvent(new Event("usage-updated"));
      } else {
        alert(data.error || "Unable to cancel subscription. Please try Manage Billing instead.");
      }
    } catch (err) {
      console.error("Cancel error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setBillingLoading(null);
    }
  };

  // Save profile
  const handleSave = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName, lastName, company, role, jobTitle, phone, bio,
          marketFocus, assetFocus,
          preferences: {
            emailNotifications: notifPrefs,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      if (data.userDoc) setProfile(data.userDoc);
      setSaveMsg({ type: "success", text: "Profile saved successfully." });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveMsg({ type: "error", text: "Failed to save profile. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  // Change password
  const handleChangePassword = async () => {
    if (!firebaseUser?.email) return;
    setPasswordMsg(null);

    if (newPassword.length < 8) {
      setPasswordMsg({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMsg({ type: "error", text: "Passwords do not match." });
      return;
    }

    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      setPasswordMsg({ type: "success", text: "Password changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setShowPasswordChange(false);
    } catch (err: any) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setPasswordMsg({ type: "error", text: "Current password is incorrect." });
      } else if (err.code === "auth/weak-password") {
        setPasswordMsg({ type: "error", text: "New password is too weak. Use at least 8 characters." });
      } else {
        setPasswordMsg({ type: "error", text: "Failed to change password. Please try again." });
      }
    } finally {
      setChangingPassword(false);
    }
  };

  // Send password reset email
  const handlePasswordResetEmail = async () => {
    if (!firebaseUser?.email) return;
    try {
      await requestPasswordReset(firebaseUser.email);
      setPasswordMsg({ type: "success", text: "Password reset email sent. Check your inbox." });
    } catch {
      setPasswordMsg({ type: "error", text: "Failed to send reset email." });
    }
  };

  // Sign out
  const handleSignOut = async () => {
    try {
      await auth.signOut();
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  // Delete account
  const handleDeleteAccount = async () => {
    if (!firebaseUser || deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmText: "DELETE" }),
      });
      if (!res.ok) throw new Error("Failed");
      await auth.signOut();
      router.push("/login");
    } catch {
      setDeleting(false);
      alert("Failed to delete account. Please try again.");
    }
  };

  const isPasswordUser = profile?.authProviders?.includes("password");
  const isGoogleUser = profile?.authProviders?.includes("google.com");

  // Not logged in state
  if (!loading && !firebaseUser) {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center", padding: "60px 20px" }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%", background: "rgba(132, 204, 22, 0.08)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="1.5">
            <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: SURFACE, margin: "0 0 8px", fontFamily: "'Inter', sans-serif" }}>
          Sign in to manage your profile
        </h2>
        <p style={{ fontSize: 13, color: MUTED, margin: "0 0 24px" }}>
          Create an account or sign in to access your profile settings.
        </p>
        <button onClick={() => router.push("/login")} style={btnPrimary}>
          Sign In
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
        <div style={{
          width: 36, height: 36, border: `3px solid ${BORDER}`, borderTopColor: PRIMARY,
          borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 16px",
        }} />
        <p style={{ fontSize: 13, color: MUTED }}>Loading profile...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const sections = [
    { id: "profile" as const, label: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
    { id: "security" as const, label: "Security", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
    { id: "notifications" as const, label: "Notifications", icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
    { id: "account" as const, label: "Billing", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .profile-input:focus { border-color: ${PRIMARY} !important; }
        .profile-tab:hover { color: ${PRIMARY} !important; background: rgba(132, 204, 22, 0.04) !important; }
        .profile-toggle { position: relative; width: 40px; height: 22px; border-radius: 11px; cursor: pointer; border: none; transition: background 0.2s; }
        .profile-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
        .profile-toggle.on { background: ${PRIMARY}; }
        .profile-toggle.on::after { transform: translateX(18px); }
        .profile-toggle.off { background: #D8DFE9; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6 }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: PRIMARY,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 20, fontWeight: 700, fontFamily: "'Inter', sans-serif",
          flexShrink: 0,
        }}>
          {(profile?.firstName || profile?.email || "U").charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: SURFACE, fontFamily: "'Inter', sans-serif" }}>
            {profile?.firstName && profile?.lastName
              ? `${profile.firstName} ${profile.lastName}`
              : profile?.email || "Your Profile"}
          </h1>
          <p style={{ fontSize: 13, color: MUTED, margin: "2px 0 0" }}>
            {profile?.email}
            {profile?.tier && profile.tier !== "free" && (
              <span style={{
                marginLeft: 8, padding: "2px 8px", borderRadius: 4,
                background: "rgba(132, 204, 22, 0.08)", color: PRIMARY,
                fontSize: 11, fontWeight: 600, textTransform: "uppercase",
              }}>
                {profile.tier}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `1px solid ${BORDER}`,
        marginBottom: 24, marginTop: 20,
      }}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className="profile-tab"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 16px", background: "none", border: "none",
              borderBottom: activeSection === s.id ? `2px solid ${PRIMARY}` : "2px solid transparent",
              color: activeSection === s.id ? PRIMARY : MUTED,
              fontSize: 13, fontWeight: activeSection === s.id ? 600 : 400,
              cursor: "pointer", fontFamily: "'Inter', sans-serif",
              transition: "all 0.15s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d={s.icon} />
            </svg>
            {s.label}
          </button>
        ))}
      </div>

      {/* ===== PROFILE SECTION ===== */}
      {activeSection === "profile" && (
        <>
          {/* Personal Information */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: SURFACE }}>Personal Information</h2>
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 20px" }}>This information is used across your DealBoard.</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>First Name</label>
                <input className="profile-input" style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input className="profile-input" style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={{ ...inputStyle, background: "#f9fafb", color: MUTED }} value={profile?.email || ""} disabled />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input className="profile-input" style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Company</label>
                <input className="profile-input" style={inputStyle} value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" />
              </div>
              <div>
                <label style={labelStyle}>Job Title</label>
                <input className="profile-input" style={inputStyle} value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Senior Analyst" />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Role</label>
              <select className="profile-input" style={selectStyle} value={role} onChange={e => setRole(e.target.value)}>
                {ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Bio</label>
              <textarea
                className="profile-input"
                style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Brief description of your experience or investment focus..."
              />
            </div>
          </div>

          {/* CRE Focus */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: SURFACE }}>CRE Focus</h2>
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 20px" }}>Help us tailor your analysis experience.</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Market Focus</label>
                <input className="profile-input" style={inputStyle} value={marketFocus} onChange={e => setMarketFocus(e.target.value)}
                  placeholder="e.g. Southeast US, Texas, National" />
              </div>
              <div>
                <label style={labelStyle}>Asset Focus</label>
                <input className="profile-input" style={inputStyle} value={assetFocus} onChange={e => setAssetFocus(e.target.value)}
                  placeholder="e.g. NNN Retail, Industrial, Office" />
              </div>
            </div>
          </div>

          {/* Save */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
            <button onClick={handleSave} disabled={saving} style={{
              ...btnPrimary,
              opacity: saving ? 0.7 : 1, cursor: saving ? "not-allowed" : "pointer",
            }}>
              {saving ? "Saving..." : "Save Profile"}
            </button>
            {saveMsg && (
              <span style={{
                fontSize: 13, fontWeight: 500,
                color: saveMsg.type === "success" ? "#059669" : "#DC2626",
              }}>
                {saveMsg.text}
              </span>
            )}
          </div>
        </>
      )}

      {/* ===== SECURITY SECTION ===== */}
      {activeSection === "security" && (
        <>
          {/* Authentication Methods */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: SURFACE }}>Authentication</h2>
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 20px" }}>Manage how you sign in to your account.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Email/Password */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: 6, border: `1px solid ${BORDER}`,
                background: isPasswordUser ? "rgba(5, 150, 105, 0.04)" : "#f9fafb",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isPasswordUser ? "#059669" : MUTED} strokeWidth="1.75">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: SURFACE }}>Email &amp; Password</div>
                    <div style={{ fontSize: 11, color: MUTED }}>{profile?.email}</div>
                  </div>
                </div>
                {isPasswordUser && (
                  <span style={{
                    padding: "3px 10px", borderRadius: 4, background: "rgba(5, 150, 105, 0.1)",
                    color: "#059669", fontSize: 11, fontWeight: 600,
                  }}>Connected</span>
                )}
              </div>

              {/* Google */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: 6, border: `1px solid ${BORDER}`,
                background: isGoogleUser ? "rgba(5, 150, 105, 0.04)" : "#f9fafb",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: SURFACE }}>Google</div>
                    <div style={{ fontSize: 11, color: MUTED }}>{isGoogleUser ? "Linked to your Google account" : "Not connected"}</div>
                  </div>
                </div>
                {isGoogleUser && (
                  <span style={{
                    padding: "3px 10px", borderRadius: 4, background: "rgba(5, 150, 105, 0.1)",
                    color: "#059669", fontSize: 11, fontWeight: 600,
                  }}>Connected</span>
                )}
              </div>
            </div>
          </div>

          {/* Change Password */}
          {isPasswordUser && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: SURFACE }}>Change Password</h2>
              <p style={{ fontSize: 12, color: MUTED, margin: "0 0 16px" }}>Update your password or request a reset link.</p>

              {!showPasswordChange ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setShowPasswordChange(true)} style={btnPrimary}>
                    Change Password
                  </button>
                  <button onClick={handlePasswordResetEmail} style={btnOutline}>
                    Send Reset Email
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
                    <div>
                      <label style={labelStyle}>Current Password</label>
                      <input className="profile-input" type="password" style={inputStyle}
                        value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>New Password</label>
                      <input className="profile-input" type="password" style={inputStyle}
                        value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters" />
                    </div>
                    <div>
                      <label style={labelStyle}>Confirm New Password</label>
                      <input className="profile-input" type="password" style={inputStyle}
                        value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    <button onClick={handleChangePassword} disabled={changingPassword} style={{
                      ...btnPrimary, opacity: changingPassword ? 0.7 : 1,
                    }}>
                      {changingPassword ? "Updating..." : "Update Password"}
                    </button>
                    <button onClick={() => { setShowPasswordChange(false); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); }} style={btnOutline}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {passwordMsg && (
                <div style={{
                  marginTop: 12, padding: "10px 14px", borderRadius: 6,
                  background: passwordMsg.type === "success" ? "rgba(5, 150, 105, 0.06)" : "rgba(220, 38, 38, 0.06)",
                  color: passwordMsg.type === "success" ? "#059669" : "#DC2626",
                  fontSize: 13, fontWeight: 500,
                }}>
                  {passwordMsg.text}
                </div>
              )}
            </div>
          )}

          {/* Email Verification Status */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: SURFACE }}>Email Verification</h2>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginTop: 12,
              padding: "12px 16px", borderRadius: 6,
              background: profile?.emailVerified ? "rgba(5, 150, 105, 0.04)" : "rgba(217, 119, 6, 0.06)",
              border: `1px solid ${profile?.emailVerified ? "rgba(5, 150, 105, 0.15)" : "rgba(217, 119, 6, 0.15)"}`,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke={profile?.emailVerified ? "#059669" : "#D97706"} strokeWidth="2">
                {profile?.emailVerified
                  ? <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  : <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                }
              </svg>
              <span style={{
                fontSize: 13, fontWeight: 500,
                color: profile?.emailVerified ? "#059669" : "#D97706",
              }}>
                {profile?.emailVerified ? "Email verified" : "Email not verified — check your inbox"}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ===== NOTIFICATIONS SECTION ===== */}
      {activeSection === "notifications" && (
        <>
          <div style={cardStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: SURFACE }}>Email Notifications</h2>
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 20px" }}>Choose what emails you receive from us.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { key: "newsletter" as const, label: "Newsletter", desc: "CRE market insights, trends, and platform updates." },
                { key: "productUpdates" as const, label: "Product Updates", desc: "New features, improvements, and platform announcements." },
                { key: "onboardingEmails" as const, label: "Onboarding Tips", desc: "Helpful tips to get the most out of the platform." },
                { key: "accountSummary" as const, label: "Account Summary", desc: "Periodic summary of your account activity, usage, and DealBoard stats." },
              ].map((item, i) => (
                <div key={item.key} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 0",
                  borderTop: i > 0 ? `1px solid ${BORDER}` : "none",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: SURFACE }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{item.desc}</div>
                  </div>
                  <button
                    className={`profile-toggle ${notifPrefs[item.key] ? "on" : "off"}`}
                    onClick={() => setNotifPrefs(p => ({ ...p, [item.key]: !p[item.key] }))}
                    aria-label={`Toggle ${item.label}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} style={{
            ...btnPrimary, marginBottom: 32,
            opacity: saving ? 0.7 : 1, cursor: saving ? "not-allowed" : "pointer",
          }}>
            {saving ? "Saving..." : "Save Notification Preferences"}
          </button>
          {saveMsg && (
            <span style={{
              fontSize: 13, fontWeight: 500, marginLeft: 12,
              color: saveMsg.type === "success" ? "#059669" : "#DC2626",
            }}>
              {saveMsg.text}
            </span>
          )}
        </>
      )}

      {/* ===== ACCOUNT SECTION ===== */}
      {activeSection === "account" && (
        <>
          {/* Current Plan */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: SURFACE }}>Plan &amp; Billing</h2>
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 16px" }}>Your current plan, usage, and subscription details.</p>

            {/* Current plan badge */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderRadius: 6, border: `1px solid ${BORDER}`,
              background: "#f9fafb", marginBottom: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: (usageData?.tier || profile?.tier || "free") !== "free"
                    ? "rgba(132, 204, 22, 0.08)" : "rgba(148, 163, 184, 0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={(usageData?.tier || profile?.tier || "free") !== "free" ? PRIMARY : MUTED}
                    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: SURFACE }}>
                    {(usageData?.tier || profile?.tier) === "pro_plus" ? "Pro+ Plan"
                      : (usageData?.tier || profile?.tier) === "pro" ? "Pro Plan"
                      : "Free Plan"}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                    {(usageData?.tier || profile?.tier || "free") === "free"
                      ? "Basic access — 5 deal analyses"
                      : (usageData?.tier || profile?.tier) === "pro"
                      ? "$40/month — up to 100 deals"
                      : "$100/month — up to 500 deals"}
                  </div>
                </div>
              </div>
              {usageData?.stripeSubscriptionId && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={handleManageBilling}
                    disabled={billingLoading === "portal"}
                    style={{
                      ...btnOutline, fontSize: 12,
                      opacity: billingLoading === "portal" ? 0.7 : 1,
                    }}
                  >
                    {billingLoading === "portal" ? "Opening..." : "Manage Billing"}
                  </button>
                  <button
                    onClick={handleCancelSubscription}
                    disabled={!!billingLoading}
                    style={{
                      ...btnDanger, fontSize: 12,
                      opacity: billingLoading === "cancel" ? 0.7 : 1,
                    }}
                  >
                    {billingLoading === "cancel" ? "Cancelling..." : "Cancel Plan"}
                  </button>
                </div>
              )}
            </div>

            {/* Usage bar */}
            {usageData && (
              <div style={{
                padding: "14px 20px", borderRadius: 6, border: `1px solid ${BORDER}`,
                background: "#fff", marginBottom: 16,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: SURFACE }}>Usage This Period</span>
                  <span style={{ fontSize: 13, color: MUTED }}>
                    {usageData.uploadsUsed} / {usageData.uploadLimit} deals
                  </span>
                </div>
                <div style={{
                  height: 6, background: "rgba(148, 163, 184, 0.15)", borderRadius: 3, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, Math.round((usageData.uploadsUsed / usageData.uploadLimit) * 100))}%`,
                    background: usageData.uploadsUsed >= usageData.uploadLimit ? "#DC2626"
                      : usageData.uploadsUsed >= usageData.uploadLimit * 0.8 ? "#eab308" : "#10b981",
                    borderRadius: 3, transition: "width 0.3s ease",
                  }} />
                </div>
              </div>
            )}

            {/* Upgrade options — only show for non-pro_plus users */}
            {(usageData?.tier || profile?.tier || "free") !== "pro_plus" && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: SURFACE, marginBottom: 12 }}>
                  {(usageData?.tier || profile?.tier || "free") === "free" ? "Upgrade Your Plan" : "Switch Plan"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: (usageData?.tier || profile?.tier || "free") === "pro" ? "1fr" : "1fr 1fr", gap: 12 }}>
                  {/* Show Pro card only for free users */}
                  {(usageData?.tier || profile?.tier || "free") === "free" && (
                    <div style={{
                      padding: "20px", borderRadius: 8,
                      border: `1.5px solid ${BORDER}`,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pro</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: SURFACE, margin: "6px 0 4px" }}>
                        $40<span style={{ fontSize: 13, fontWeight: 400, color: MUTED }}>/mo</span>
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 16px" }}>
                        {PLANS.pro.features.slice(0, 3).map((f: string) => (
                          <li key={f} style={{ fontSize: 12, color: "#475569", padding: "2px 0", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#10b981" }}>✓</span> {f}
                          </li>
                        ))}
                      </ul>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <button
                          onClick={() => handleUpgradeCheckout("pro")}
                          disabled={!!billingLoading}
                          style={{
                            maxWidth: 200, padding: "9px 24px", border: `2px solid ${SURFACE}`,
                            borderRadius: 6, background: "#fff", color: SURFACE,
                            fontSize: 13, fontWeight: 600, cursor: billingLoading ? "not-allowed" : "pointer",
                            fontFamily: "'Inter', sans-serif",
                          }}
                        >
                          {billingLoading === "pro" ? "Loading..." : "Start Pro"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pro+ card — show for free and pro users */}
                  <div style={{
                    padding: "20px", borderRadius: 8,
                    border: `1.5px solid ${PRIMARY}`, position: "relative",
                  }}>
                    <div style={{
                      position: "absolute", top: -9, right: 14,
                      background: PRIMARY, color: "#fff", fontSize: 9, fontWeight: 700,
                      padding: "2px 8px", borderRadius: 8, textTransform: "uppercase", letterSpacing: "0.05em",
                    }}>Best Value</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pro+</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: SURFACE, margin: "6px 0 4px" }}>
                      $100<span style={{ fontSize: 13, fontWeight: 400, color: MUTED }}>/mo</span>
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 16px" }}>
                      {PLANS.pro_plus.features.slice(0, 3).map((f: string) => (
                        <li key={f} style={{ fontSize: 12, color: "#475569", padding: "2px 0", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#10b981" }}>✓</span> {f}
                        </li>
                      ))}
                    </ul>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <button
                        onClick={() => handleUpgradeCheckout("pro_plus")}
                        disabled={!!billingLoading}
                        style={{
                          maxWidth: 200, padding: "9px 24px", border: "none",
                          borderRadius: 6, background: PRIMARY, color: "#fff",
                          fontSize: 13, fontWeight: 600, cursor: billingLoading ? "not-allowed" : "pointer",
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {billingLoading === "pro_plus" ? "Loading..."
                          : (usageData?.tier || profile?.tier) === "pro" ? "Upgrade to Pro+" : "Start Pro+"}
                      </button>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: MUTED, marginTop: 10, textAlign: "center" }}>
                  Cancel anytime. No long-term commitment required.
                </p>
              </div>
            )}
          </div>

          {/* Sign Out */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: SURFACE }}>Session</h2>
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 16px" }}>Sign out of your account on this device.</p>
            <button onClick={handleSignOut} style={btnOutline}>
              Sign Out
            </button>
          </div>

          {/* Danger Zone */}
          <div style={{
            ...cardStyle,
            border: "1px solid rgba(220, 38, 38, 0.15)",
            background: "rgba(220, 38, 38, 0.02)",
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: "#DC2626" }}>Danger Zone</h2>
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 16px" }}>
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>

            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)} style={btnDanger}>
                Delete Account
              </button>
            ) : (
              <div style={{
                padding: "16px 20px", borderRadius: 6,
                background: "rgba(220, 38, 38, 0.04)", border: "1px solid rgba(220, 38, 38, 0.15)",
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#DC2626", margin: "0 0 12px" }}>
                  Are you sure? Type DELETE to confirm.
                </p>
                <input
                  className="profile-input"
                  style={{ ...inputStyle, maxWidth: 200, marginBottom: 12, borderColor: "rgba(220, 38, 38, 0.3)" }}
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== "DELETE" || deleting}
                    style={{
                      ...btnDanger,
                      background: deleteConfirmText === "DELETE" ? "#DC2626" : "#f9fafb",
                      color: deleteConfirmText === "DELETE" ? "#fff" : "#DC2626",
                      opacity: deleting ? 0.7 : 1,
                    }}
                  >
                    {deleting ? "Deleting..." : "Permanently Delete"}
                  </button>
                  <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }} style={btnOutline}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
