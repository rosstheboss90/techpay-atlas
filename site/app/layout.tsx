import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TechPay Atlas',
  description: 'US tech salaries by metro — official BLS data, cost-of-living adjusted, with real H-1B employer filings',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
