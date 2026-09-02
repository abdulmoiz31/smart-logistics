import type { Metadata } from 'next';
import { AuthBadge } from '@/components/AuthBadge';
import './globals.css';

export const metadata: Metadata = {
  title: 'MoveScan',
  description: 'A photo-first moving survey and estimate.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('movescan-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`,
          }}
        />
      </head>
      <body>
        <AuthBadge />
        {children}
      </body>
    </html>
  );
}
