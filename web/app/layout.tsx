import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import Web3Provider from '@/providers/Web3Provider';

export const metadata: Metadata = {
  title: 'GOODHUB — Community rewards on Celo',
  description: 'Discover opportunities, participate, earn G$, and support creators with GOODHUB.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <Web3Provider>{children}</Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
