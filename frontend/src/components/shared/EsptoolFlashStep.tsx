export interface EsptoolFlashStepProps {
  /** Current step in the esptool flash process */
  step: 'prerequisite' | 'detecting' | 'flashing' | 'success' | 'error';
  /** Flash progress percentage (0-100) */
  progress: number;
  /** Name of the device being flashed */
  deviceName: string;
  /** Error message if step is 'error' */
  errorMessage?: string;
  /** Whether esptool was found on the system */
  esptoolAvailable?: boolean;
  /** Detected serial port (e.g. /dev/ttyUSB0) */
  detectedPort?: string;
  /** Whether the user has entered a manual port override */
  manualPort: string;
  /** Callback when user changes the manual port input */
  onManualPortChange: (port: string) => void;
  /** Runtime config values injected into the firmware */
  runtimeConfig?: Record<string, string>;
}

export default function EsptoolFlashStep({
  step,
  progress,
  deviceName,
  errorMessage,
  esptoolAvailable,
  detectedPort,
  manualPort,
  onManualPortChange,
  runtimeConfig,
}: EsptoolFlashStepProps) {
  return (
    <div data-testid="esptool-flash-step" className="space-y-4">
      {/* Prerequisite check */}
      <div data-testid="prerequisite-check" className="flex items-center gap-2">
        <span className={`text-sm font-medium ${
          esptoolAvailable === undefined ? 'text-atelier-text-muted' :
          esptoolAvailable ? 'text-green-400' : 'text-red-400'
        }`}>
          {esptoolAvailable === undefined && 'Checking for esptool...'}
          {esptoolAvailable === true && 'esptool found'}
          {esptoolAvailable === false && 'esptool not found'}
        </span>
        {esptoolAvailable === false && (
          <p className="text-xs text-atelier-text-muted mt-1">
            Install it with: pip install esptool
          </p>
        )}
      </div>

      {/* Serial port detection */}
      {step !== 'error' && esptoolAvailable !== false && (
        <div data-testid="port-detection" className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-sm ${detectedPort ? 'text-green-400' : 'text-atelier-text-secondary'}`}>
              {detectedPort
                ? `Board detected on ${detectedPort}`
                : 'Looking for your board...'}
            </span>
          </div>
          <div>
            <label htmlFor="manual-port" className="text-xs text-atelier-text-muted block mb-1">
              Or type the port yourself:
            </label>
            <input
              id="manual-port"
              type="text"
              placeholder="/dev/ttyUSB0"
              value={manualPort}
              onChange={(e) => onManualPortChange(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg bg-atelier-surface border border-atelier-text-muted/30 text-atelier-text placeholder:text-atelier-text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent-sky"
              data-testid="manual-port-input"
            />
          </div>
        </div>
      )}

      {/* Flash progress */}
      {step === 'flashing' && (
        <div data-testid="flash-progress">
          <p className="text-sm text-atelier-text-secondary mb-2">
            Writing {deviceName} to your board...
          </p>
          <div className="w-full bg-atelier-surface rounded-full h-3">
            <div
              className="bg-accent-sky h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
              data-testid="progress-bar-fill"
            />
          </div>
          <p className="text-xs text-atelier-text-muted mt-1">{progress}% complete</p>
        </div>
      )}

      {/* Runtime config status */}
      {runtimeConfig && Object.keys(runtimeConfig).length > 0 && step !== 'error' && (
        <div data-testid="runtime-config" className="text-xs text-atelier-text-muted space-y-0.5">
          <p className="font-medium text-atelier-text-secondary">Settings baked in:</p>
          {Object.entries(runtimeConfig).map(([key, value]) => (
            <p key={key}>
              {key}: {key.toLowerCase().includes('key') ? '****' : value}
            </p>
          ))}
        </div>
      )}

      {/* Success state */}
      {step === 'success' && (
        <div data-testid="flash-success" className="text-center py-2">
          <p className="text-green-400 font-medium">Flash complete!</p>
          <p className="text-sm text-atelier-text-secondary mt-1">
            {deviceName} is ready to go. Unplug and replug your board to start it up!
          </p>
        </div>
      )}

      {/* Error state */}
      {step === 'error' && (
        <div data-testid="flash-error" className="text-center py-2">
          <p className="text-red-400 font-medium">Something went wrong</p>
          {errorMessage && (
            <p className="text-sm text-atelier-text-secondary mt-1">{errorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
