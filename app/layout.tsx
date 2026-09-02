import type { Metadata } from 'next';
import { AuthBadge } from '@/components/AuthBadge';
import './globals.css';

export const metadata: Metadata = {
  title: 'MoveScan',
  description: 'A photo-first moving survey and estimate.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthBadge />
        {children}
      </body>
    </html>
  );
}
