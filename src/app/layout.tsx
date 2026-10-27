import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/lib/toast/ToastContext';
import { AuthProvider } from '@/lib/auth/AuthContext';

export const metadata: Metadata = {
  title: 'SUSI AI - Autonomous Workforce',
  description: 'Next-generation autonomous multi-agent fleet operations and task orchestration platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full w-full bg-[#FDFBF7] text-stone-800 flex flex-col overflow-x-hidden overflow-y-auto font-sans">
        <ToastProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
