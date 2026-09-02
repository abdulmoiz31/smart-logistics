import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AppHeader } from '@/components/AppHeader';
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
            __html: `(function(){var agent=location.pathname.startsWith('/agent');var fallback=agent?'dark':'light';try{var stored=localStorage.getItem('movescan-theme');document.documentElement.dataset.theme=stored==='dark'||stored==='light'?stored:fallback;}catch(e){document.documentElement.dataset.theme=fallback;}})();`,
          }}
        />
      </head>
      <body>
        {!isAgent && <AppHeader pathname={pathname} />}
        {children}
      </body>
    </html>
  );
}
