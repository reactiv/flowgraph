'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function Home() {
  const router = useRouter();

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: api.listWorkflows,
  });

  useEffect(() => {
    if (!isLoading && workflows !== undefined) {
      if (workflows.length > 0 && workflows[0]) {
        // Redirect to first workflow
        router.replace(`/workflows/${workflows[0].id}`);
      } else {
        // Redirect to create page
        router.replace('/create');
      }
    }
  }, [workflows, isLoading, router]);

  // Show loading state while determining redirect
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground">Loading...</div>
    </main>
  );
}
