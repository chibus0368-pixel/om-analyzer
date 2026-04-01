import Image from 'next/image';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
}

/**
 * Shimmer SVG placeholder for blur effect
 * Base64 encoded tiny SVG that generates a loading shimmer
 */
const shimmer = (w: number, h: number) =>
  `
<svg width="${w}" height="${h}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="g">
      <stop offset="20%" stop-color="#f3f4f6" />
      <stop offset="50%" stop-color="#e5e7eb" />
      <stop offset="80%" stop-color="#f3f4f6" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#f3f4f6" />
  <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
  <animate xlink:href="#r" attributeName="x" from="-${w}" to="${w}" dur="1s" repeatCount="indefinite" />
</svg>
`.replace(/\n/g, '');

/**
 * Convert base64 SVG string
 */
const toBase64 = (str: string) =>
  typeof window === 'undefined'
    ? Buffer.from(str).toString('base64')
    : btoa(str);

/**
 * Generate blur placeholder data URL
 */
const blurDataURL = (width: number, height: number) =>
  `data:image/svg+xml;base64,${toBase64(shimmer(width, height))}`;

/**
 * Allowed image domains for optimization
 * Images from these domains will use Next.js Image optimization
 */
const ALLOWED_DOMAINS = [
  'images.unsplash.com',
  'firebasestorage.googleapis.com',
];

/**
 * Check if URL is from an allowed domain
 */
function isFromAllowedDomain(src: string): boolean {
  try {
    const url = new URL(src, 'https://example.com');
    return ALLOWED_DOMAINS.some((domain) => url.hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * OptimizedImage Component
 *
 * Wrapper around Next.js Image component with:
 * - Automatic blur placeholder for loading states
 * - Quality optimization for Unsplash images
 * - Fallback to regular img tag for non-optimized domains
 * - Lazy loading support
 * - Responsive sizing
 *
 * @param src - Image URL (should be from allowed domains)
 * @param alt - Alt text for accessibility
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param priority - If true, image loads immediately (no lazy loading)
 * @param className - Optional CSS class name
 *
 * @example
 * <OptimizedImage
 *   src="https://images.unsplash.com/photo-xxx"
 *   alt="Product image"
 *   width={400}
 *   height={300}
 *   priority={false}
 *   className="rounded-lg"
 * />
 */
export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  priority = false,
  className = '',
}: OptimizedImageProps) {
  // Check if image domain is allowed for optimization
  const isOptimizable = isFromAllowedDomain(src);

  // Use regular img tag for non-optimized domains
  if (!isOptimizable) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        className={className}
        style={{
          width: '100%',
          height: 'auto',
          maxWidth: `${width}px`,
        }}
      />
    );
  }

  // Determine quality based on domain
  const quality = src.includes('unsplash.com') ? 80 : 90;

  // Use Next.js Image for optimized domains
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      quality={quality}
      placeholder="blur"
      blurDataURL={blurDataURL(width, height)}
      loading={priority ? 'eager' : 'lazy'}
      className={className}
      sizes={`(max-width: 768px) 100vw, (max-width: 1200px) 50vw, ${width}px`}
      style={{
        width: '100%',
        height: 'auto',
      }}
    />
  );
}
