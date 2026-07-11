import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/**
 * IBM Plex — designed by Mike Abbink / Bold Monday for IBM's product systems.
 * Enterprise-grade readability; not the Inter/Geist starter-kit default.
 */
const body = IBM_Plex_Sans({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

// Apply the actual family on <body> so UI never falls back to unstyled system text
// when only the CSS variable is set.

export const metadata: Metadata = {
  title: 'HandyQuote — Estimates for field contractors',
  description:
    'Create professional estimates, collect e-signatures, and track invoices. Built for handymen and field crews.',
  icons: {
    icon: [{ url: '/brand/logo-mark.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/brand/logo-mark-rich.jpg' }],
  },
  other: {
    // Cache-bust marker so you can confirm the latest UI build in view-source
    'hq-ui': 'v5-brand-2026-07-11',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Bust stale caches + kill service workers that pin old CSS */}
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
      </head>
      <body className={`${body.variable} ${mono.variable} ${body.className}`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})});}if(window.caches){caches.keys().then(function(k){k.forEach(function(n){caches.delete(n)})});}}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
