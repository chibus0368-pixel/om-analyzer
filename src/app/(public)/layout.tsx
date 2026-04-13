import { Metadata } from "next";

export const metadata: Metadata = {
  title: "DealSignals - Commercial Real Estate Pre-Diligence",
  description: "Authentication",
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
        // Standardized auth background - same treatment across login,
        // register, forgot-password, verify-email, etc.
        background:
          "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(132, 204, 22, 0.08), transparent 70%), " +
          "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(11, 17, 32, 0.04), transparent 70%), " +
          "#FAFBFC",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          boxShadow:
            "0 1px 3px rgba(11, 17, 32, 0.04), 0 24px 48px rgba(11, 17, 32, 0.08)",
          border: "1px solid rgba(11, 17, 32, 0.06)",
          padding: "44px 40px",
        }}
      >
        {children}
      </div>
    </div>
  );
}
