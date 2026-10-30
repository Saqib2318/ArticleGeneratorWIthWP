import Sidebar from '@/components/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-bg min-h-screen">
      <Sidebar />
      <div className="pl-[260px]">
        <main className="mx-auto min-h-screen max-w-6xl px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
