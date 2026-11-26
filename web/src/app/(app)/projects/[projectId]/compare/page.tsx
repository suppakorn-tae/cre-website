import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { ContentSkeleton } from '@/features/shell/Skeletons';
import { projectPaths } from '@/features/versions/rules';

/** The comparison lives in the versions tab now; old links and bookmarks land on its RM view. */
export default function ComparePage({ params }: { params: Promise<{ projectId: string }> }) {
  // Reading `params` ties the output to one URL, so it waits inside the
  // boundary and the shell around it can prerender.
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <CompareRedirect params={params} />
    </Suspense>
  );
}

async function CompareRedirect({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return redirect(projectPaths.versions(projectId, 'rm'));
}
