import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Семейный бюджет',
  description: 'PWA веб-приложение для учета личных и семейных финансов, бюджета, инвестиций и целей.',
  openGraph: {
    title: 'Семейный бюджет',
    description: 'PWA веб-приложение для учета личных и семейных финансов, бюджета, инвестиций и целей.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Семейный бюджет',
    description: 'PWA веб-приложение для учета личных и семейных финансов, бюджета, инвестиций и целей.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
