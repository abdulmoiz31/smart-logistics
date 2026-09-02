import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AuthBadge } from '@/components/AuthBadge';
import './globals.css';

export const metadata: Metadata = {
  title: 'MoveScan',
  description: 'A photo-first moving survey and estimate.',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = (await headers()).get('x-pathname') ?? '';
  const isAgent = pathname.startsWith('/agent');
  const theme = isAgent ? 'dark' : 'light';

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var isAgent=location.pathname.startsWith('/agent');if(!isAgent){document.documentElement.dataset.theme='light';return;}try{var t=localStorage.getItem('movescan-theme');if(!t){t='dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`,
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
