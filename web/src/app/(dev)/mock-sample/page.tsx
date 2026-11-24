'use client';

import { useQuery } from '@tanstack/react-query';

import { BROWSER_BASE_URL } from '@/lib/api/client';

// Mock-only path: the contract has no endpoint to call yet, so this uses a
// plain fetch. Replace with the typed API client once endpoints exist.
async function fetchSample(): Promise<unknown> {
  const res = await fetch(`${BROWSER_BASE_URL}/mock-sample`);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function MockSamplePage() {
  const { data, error, isPending } = useQuery({ queryKey: ['mock-sample'], queryFn: fetchSample });

  return (
    <main>
      <pre data-testid="mock-sample">
        {isPending ? '…' : error ? String(error) : JSON.stringify(data, null, 2)}
      </pre>
    </main>
  );
}
