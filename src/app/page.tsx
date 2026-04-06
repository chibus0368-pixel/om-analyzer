// Homepage is served via rewrite → /om-analyzer in next.config.ts
// This empty page exists as a fallback; the rewrite takes priority.
export default function HomePage() {
  return null;
}
