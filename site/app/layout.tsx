import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TechPay Atlas',
  description: 'See what tech jobs actually pay across US cities — real salary ranges by role and location, adjusted for cost of living, built from public government data.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
