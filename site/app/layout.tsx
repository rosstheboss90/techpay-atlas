import type { Metadata } from 'next'
import './globals.css'

const description =
  'See what tech jobs actually pay across US cities — real salary ranges by role and location, adjusted for cost of living, built from public government data.'

// Absolute asset/page URLs must carry the Pages subpath; metadataBase supplies the origin.
// (The custom-domain switch — see docs/BACKLOG.md — updates metadataBase and drops the base path.)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const metadata: Metadata = {
  metadataBase: new URL('https://rosstheboss90.github.io'),
  title: 'TechPay Atlas',
  description,
  openGraph: {
    title: 'TechPay Atlas',
    description,
    siteName: 'TechPay Atlas',
    type: 'website',
    url: `${basePath}/`,
    images: [{ url: `${basePath}/og.png`, width: 1250, height: 985, alt: 'TechPay Atlas — US tech salary map by metro' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TechPay Atlas',
    description,
    images: [`${basePath}/og.png`],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // data-scroll-behavior acknowledges the `scroll-behavior: smooth` the section nav
  // relies on, so Next does not warn about it during route transitions.
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  )
}
