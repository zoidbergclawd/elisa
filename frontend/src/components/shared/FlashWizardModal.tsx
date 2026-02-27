import { useMemo, useState } from 'react';
import EsptoolFlashStep from './EsptoolFlashStep';

interface FlashWizardModalProps {
  deviceRole: string;
  message: string;
  isFlashing?: boolean;
  progress?: number;
  deviceName?: string;
  flashMethod?: string;
  onReady: () => void;
  onCancel: () => void;
}

const FRIENDLY_NAMES: Record<string, string> = {
  sensor_node: 'Sensor Node',
  gateway_node: 'Gateway Node',
};

export default function FlashWizardModal({
  deviceRole,
  message,
  isFlashing = false,
  progress = 0,
  deviceName,
  flashMethod,
  onReady,
  onCancel,
}: FlashWizardModalProps) {
  const friendlyName = useMemo(
    () => deviceName ?? FRIENDLY_NAMES[deviceRole] ?? deviceRole,
    [deviceName, deviceRole],
  );

  const isEsptool = flashMethod === 'esptool';
  const [manualPort, setManualPort] = useState('');

  /** Derive the esptool step from the flash state */
  const esptoolStep = useMemo(() => {
    if (isFlashing && progress >= 100) return 'success' as const;
    if (isFlashing) return 'flashing' as const;
    return 'detecting' as const;
  }, [isFlashing, progress]);

  return (
    <div
      className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flash-wizard-title"
    >
      <div className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-md mx-4 w-full animate-float-in">
        <h2 id="flash-wizard-title" className="text-xl font-display font-bold mb-2 text-atelier-text">
          Flash {friendlyName}
        </h2>
        <p className="text-atelier-text-secondary text-sm mb-4">{message}</p>

        {isEsptool ? (
          <div className="mb-4">
            <EsptoolFlashStep
              step={esptoolStep}
              progress={progress}
              deviceName={friendlyName}
              esptoolAvailable={true}
              manualPort={manualPort}
              onManualPortChange={setManualPort}
            />
          </div>
        ) : (
          isFlashing && (
            <div className="mb-4">
              <div className="w-full bg-atelier-surface rounded-full h-3">
                <div
                  className="bg-accent-sky h-3 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <p className="text-xs text-atelier-text-muted mt-1">{progress}% complete</p>
            </div>
          )
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm cursor-pointer border border-atelier-text-muted/30 text-atelier-text-secondary hover:bg-atelier-surface/60 hover:text-atelier-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onReady}
            disabled={isFlashing}
            className="go-btn px-4 py-2 rounded-xl font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ready
          </button>
        </div>
      </div>
    </div>
  );
}
