import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deal Signals - CRE Intelligence & Analytics",
  description: "Authentication",
};

const C = {
  bg: "#faf8ff",
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
        backgroundColor: C.bg,
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          backgroundColor: "#ffffff",
          borderRadius: "6px",
          boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
          padding: "48px 32px",
        }}
      >
        {children}
      </div>
    </div>
  );
}
