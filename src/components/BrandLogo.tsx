import Link from 'next/link';
import Image from 'next/image';

type Props = {
  /** Omit or null = not a link */
  href?: string | null;
  /** mark | mark+wordmark */
  variant?: 'mark' | 'full';
  /** light text for dark headers */
  inverted?: boolean;
  className?: string;
  size?: number;
  showWordmark?: boolean;
};

/**
 * HandyQuote brand mark — SVG assets in /public/brand.
 * Prefer this over CSS pseudo “document” marks so favicon, app bar, and marketing match.
 */
export function BrandLogo({
  href = '/',
  variant = 'full',
  inverted = false,
  className = '',
  size = 28,
  showWordmark = true,
}: Props) {
  const markOnly = variant === 'mark' || !showWordmark;
  const content = (
    <span
      className={`hq-brand ${inverted ? 'hq-brand--inverted' : ''} ${className}`.trim()}
      data-variant={markOnly ? 'mark' : 'full'}
    >
      <Image
        src="/brand/logo-mark.svg"
        alt=""
        width={size}
        height={size}
        className="hq-brand-mark"
        priority
        unoptimized
      />
      {!markOnly && <span className="hq-brand-word">Ledgerly</span>}
    </span>
  );

  if (href == null || href === '') return content;
  return (
    <Link href={href} className="hq-brand-link" aria-label="Ledgerly home">
      {content}
    </Link>
  );
}
