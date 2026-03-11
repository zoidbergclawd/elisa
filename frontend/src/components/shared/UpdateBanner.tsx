import { useState, useEffect } from 'react';

/**
 * Shows a banner when an app update has been downloaded and is ready to install.
 * Only appears in Electron (production) when the auto-updater sends an IPC event.
 */
export default function UpdateBanner() {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as unknown as Record<string, any>).elisaAPI;
    if (!api?.onUpdateDownloaded) return;
    const cleanup = api.onUpdateDownloaded((version: string) => {
      setUpdateVersion(version);
    });
    return cleanup;
  }, []);

  if (!updateVersion || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-900">
      <span>
        Version {updateVersion} is ready. It will install when you close the app.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-amber-600 hover:text-amber-800 font-medium"
      >
        Dismiss
      </button>
    </div>
  );
}
