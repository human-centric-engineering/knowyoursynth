'use client';

/**
 * Synth page error boundary.
 *
 * Catches errors in the `(panel)` routes, inside the frame, so the header and
 * its way back out stay on screen.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 */

import { Home } from 'lucide-react';
import { RouteErrorBoundary } from '@/components/errors/route-error-boundary';

export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      boundaryName="PanelError"
      tag="panel"
      title="Something went wrong"
      description="The synth page hit an unexpected error. Try again, or go back to the home page."
      fallback={{
        label: 'Go home',
        href: '/',
        navigate: 'reload',
        icon: <Home className="mr-2 h-4 w-4" />,
      }}
    />
  );
}
