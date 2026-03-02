import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EsptoolFlashStep from './EsptoolFlashStep';
import FacePreview from '../Meeting/FacePreview';
import type { FaceDescriptor } from '../../types';
import type { PreFlashChecklist } from '../../hooks/useBuildSession';

type WizardStep = 'pre-flash' | 'connect' | 'flashing' | 'waking' | 'celebration';

/** Default face used when no face_descriptor is provided. */
const DEFAULT_FACE: FaceDescriptor = {
  base_shape: 'round',
  eyes: { style: 'circles', size: 'medium', color: '#4361ee' },
  mouth: { style: 'smile' },
  expression: 'happy',
  colors: { face: '#f0f0f0', accent: '#ffb3ba' },
};

/** Map wizard step to FacePreview animation state. */
const STEP_TO_FACE_STATE: Record<WizardStep, 'idle' | 'listening' | 'thinking' | 'speaking'> = {
  'pre-flash': 'idle',
  'connect': 'idle',
  'flashing': 'thinking',
  'waking': 'listening',
  'celebration': 'speaking',
};

export interface FlashWizardModalProps {
  deviceRole: string;
  message: string;
  isFlashing?: boolean;
  progress?: number;
  deviceName?: string;
  flashMethod?: string;
  agentName?: string;
  wakeWord?: string;
  agentId?: string;
  agentGreeting?: string;
  faceDescriptor?: FaceDescriptor;
  preFlashChecklist?: PreFlashChecklist;
  onReady: () => void;
  onCancel: () => void;
  onDashboard?: () => void;
}

type HeartbeatStatus = 'polling' | 'success' | 'timeout';

const FRIENDLY_NAMES: Record<string, string> = {
  sensor_node: 'Sensor Node',
  gateway_node: 'Gateway Node',
};

const HEARTBEAT_INTERVAL = 2000;
const HEARTBEAT_TIMEOUT = 30000;

/** Generate random confetti particles */
function generateConfetti(count: number) {
  const colors = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c'];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1.5,
  }));
}

export default function FlashWizardModal({
  deviceRole,
  message,
  isFlashing = false,
  progress = 0,
  deviceName,
  flashMethod,
  agentName,
  wakeWord = 'Hey Elisa',
  agentId,
  agentGreeting,
  faceDescriptor,
  preFlashChecklist,
  onReady,
  onCancel,
  onDashboard,
}: FlashWizardModalProps) {
  const friendlyName = useMemo(
    () => deviceName ?? FRIENDLY_NAMES[deviceRole] ?? deviceRole,
    [deviceName, deviceRole],
  );

  const displayName = agentName || friendlyName;
  const isEsptool = flashMethod === 'esptool';
  const activeFace = faceDescriptor ?? DEFAULT_FACE;
  const [manualPort, setManualPort] = useState('');
  const [heartbeatStatus, setHeartbeatStatus] = useState<HeartbeatStatus>('polling');
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiParticles = useMemo(() => generateConfetti(30), []);

  // Determine which wizard step to show
  const hasChecklist = preFlashChecklist !== undefined;
  const allChecklistDone = preFlashChecklist
    ? preFlashChecklist.specReady && preFlashChecklist.runtimeProvisioned && preFlashChecklist.backpackReady && preFlashChecklist.firmwareReady
    : true;

  const [currentStep, setCurrentStep] = useState<WizardStep>(
    hasChecklist ? 'pre-flash' : 'connect'
  );

  // Auto-advance from pre-flash to connect once all items done
  useEffect(() => {
    if (currentStep === 'pre-flash' && allChecklistDone) {
      const timer = setTimeout(() => setCurrentStep('connect'), 800);
      return () => clearTimeout(timer);
    }
  }, [currentStep, allChecklistDone]);

  /* eslint-disable react-hooks/set-state-in-effect -- flash wizard state machine transitions driven by prop changes */

  // Transition to flashing step
  useEffect(() => {
    if (isFlashing && currentStep === 'connect') {
      setCurrentStep('flashing');
    }
  }, [isFlashing, currentStep]);

  // Transition to waking step when flash completes
  useEffect(() => {
    if (currentStep === 'flashing' && isFlashing && progress >= 100) {
      setCurrentStep('waking');
    }
  }, [currentStep, isFlashing, progress]);

  // Heartbeat polling in waking step
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (currentStep !== 'waking') return;

    setHeartbeatStatus('polling');

    heartbeatTimerRef.current = setInterval(async () => {
      if (!agentId) return;
      try {
        const res = await fetch(`/v1/agents/${agentId}/heartbeat`);
        if (res.ok) {
          stopHeartbeat();
          setHeartbeatStatus('success');
          setCurrentStep('celebration');
        }
      } catch {
        // Keep polling
      }
    }, HEARTBEAT_INTERVAL);

    heartbeatTimeoutRef.current = setTimeout(() => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      setHeartbeatStatus('timeout');
    }, HEARTBEAT_TIMEOUT);

    return stopHeartbeat;
  }, [currentStep, agentId, stopHeartbeat]);

  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRetryHeartbeat = useCallback(() => {
    setHeartbeatStatus('polling');
    setCurrentStep('waking');
  }, []);

  /** Derive the esptool step from the flash state */
  const esptoolStep = useMemo(() => {
    if (isFlashing && progress >= 100) return 'success' as const;
    if (isFlashing) return 'flashing' as const;
    return 'detecting' as const;
  }, [isFlashing, progress]);

  // Step indicator labels
  const stepLabels: { key: WizardStep; label: string }[] = [
    { key: 'connect', label: 'Connect' },
    { key: 'flashing', label: 'Flash' },
    { key: 'waking', label: 'Wake Up' },
    { key: 'celebration', label: 'Done' },
  ];

  const stepOrder: WizardStep[] = ['connect', 'flashing', 'waking', 'celebration'];
  const currentStepIndex = currentStep === 'pre-flash' ? -1 : stepOrder.indexOf(currentStep);

  return (
    <div
      className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flash-wizard-title"
    >
      <div className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-md mx-4 w-full animate-float-in">
        <h2 id="flash-wizard-title" className="text-xl font-display font-bold mb-2 text-atelier-text">
          {currentStep === 'celebration'
            ? `${displayName} is Alive!`
            : currentStep === 'pre-flash'
              ? `Preparing ${displayName}...`
              : `Flash ${friendlyName}`}
        </h2>

        {currentStep !== 'pre-flash' && currentStep !== 'celebration' && (
          <p className="text-atelier-text-secondary text-sm mb-4">{message}</p>
        )}

        {/* Step indicator */}
        {currentStep !== 'pre-flash' && (
          <div data-testid="step-indicator" className="flex items-center gap-1 mb-4">
            {stepLabels.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0 ${
                  i < currentStepIndex
                    ? 'bg-green-500 text-white'
                    : i === currentStepIndex
                      ? 'bg-accent-sky text-white'
                      : 'bg-atelier-surface text-atelier-text-muted'
                }`}>
                  {i < currentStepIndex ? '\u2713' : i + 1}
                </div>
                <span className={`text-xs truncate ${
                  i === currentStepIndex ? 'text-atelier-text font-medium' : 'text-atelier-text-muted'
                }`}>{s.label}</span>
                {i < stepLabels.length - 1 && (
                  <div className={`flex-1 h-px ${i < currentStepIndex ? 'bg-green-500' : 'bg-atelier-surface'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step: Pre-flash checklist */}
        {currentStep === 'pre-flash' && preFlashChecklist && (
          <div data-testid="pre-flash-checklist" className="flex items-start gap-4 mb-4">
            {faceDescriptor && (
              <div className="flex-shrink-0" data-testid="face-preview-container">
                <FacePreview face={activeFace} size={120} state={STEP_TO_FACE_STATE[currentStep]} />
              </div>
            )}
            <div className="space-y-3 flex-1">
              <ChecklistItem
                done={preFlashChecklist.specReady}
                label={`Building ${displayName}'s personality...`}
                doneLabel={`Built ${displayName}'s personality`}
              />
              <ChecklistItem
                done={preFlashChecklist.runtimeProvisioned}
                label={`Setting up ${displayName} in the cloud...`}
                doneLabel={`${displayName} set up in the cloud`}
              />
              <ChecklistItem
                done={preFlashChecklist.backpackReady}
                label="Loading the knowledge backpack..."
                doneLabel="Knowledge backpack loaded"
              />
              <ChecklistItem
                done={preFlashChecklist.firmwareReady}
                label="Preparing the firmware..."
                doneLabel="Firmware ready"
              />
              {allChecklistDone && (
                <p data-testid="checklist-complete" className="text-green-400 font-medium text-sm mt-2">
                  {displayName} is ready! Now let's put them on your device.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step: Connect (with USB port guidance) */}
        {currentStep === 'connect' && (
          <div data-testid="connect-step" className="mb-4">
            {/* USB port guidance for BOX-3 */}
            <div data-testid="usb-guidance" className="rounded-xl bg-atelier-surface/60 p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 text-2xl" aria-hidden="true">
                  <svg viewBox="0 0 48 72" className="w-10 h-14">
                    {/* Simplified BOX-3 diagram */}
                    <rect x="4" y="4" width="40" height="56" rx="4" className="fill-atelier-surface stroke-atelier-text-muted" strokeWidth="2" />
                    <rect x="12" y="10" width="24" height="18" rx="2" className="fill-accent-sky/20 stroke-accent-sky" strokeWidth="1" />
                    {/* Back port - correct */}
                    <rect x="18" y="56" width="12" height="8" rx="2" className="fill-green-500/30 stroke-green-400" strokeWidth="1.5" />
                    <text x="24" y="68" textAnchor="middle" className="fill-green-400 text-[5px] font-bold">USB</text>
                    {/* Front port - wrong */}
                    <rect x="18" y="0" width="12" height="4" rx="1" className="fill-red-500/20 stroke-red-400" strokeWidth="1" />
                  </svg>
                </div>
                <div className="text-sm space-y-1.5">
                  <p className="text-atelier-text font-medium">
                    Connect using the <span className="text-green-400">BACK</span> USB-C port
                  </p>
                  <p className="text-atelier-text-muted text-xs">
                    The back port (bottom of dock) handles data + power for flashing.
                  </p>
                  <p className="text-atelier-text-muted text-xs">
                    <span className="text-red-400">Not the front port</span> — that one is power only and won't be detected.
                  </p>
                </div>
              </div>
            </div>

            {isEsptool && (
              <EsptoolFlashStep
                step={esptoolStep}
                progress={progress}
                deviceName={friendlyName}
                esptoolAvailable={true}
                manualPort={manualPort}
                onManualPortChange={setManualPort}
              />
            )}
          </div>
        )}

        {/* Step: Flashing */}
        {currentStep === 'flashing' && (
          <div data-testid="flashing-step" className="mb-4">
            <div className={faceDescriptor ? 'flex items-start gap-4' : ''}>
              {faceDescriptor && (
                <div className="flex-shrink-0" data-testid="face-preview-container">
                  <FacePreview face={activeFace} size={120} state={STEP_TO_FACE_STATE[currentStep]} />
                </div>
              )}
              <div className="flex-1">
                {isEsptool ? (
                  <EsptoolFlashStep
                    step={esptoolStep}
                    progress={progress}
                    deviceName={displayName}
                    esptoolAvailable={true}
                    manualPort={manualPort}
                    onManualPortChange={setManualPort}
                  />
                ) : (
                  <div>
                    <p className="text-sm text-atelier-text-secondary mb-2">
                      {displayName} is loading...
                    </p>
                    <div
                      className="w-full bg-atelier-surface rounded-full h-3"
                      role="progressbar"
                      aria-valuenow={Math.min(progress, 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="bg-accent-sky h-3 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-atelier-text-muted mt-1">{progress}% complete</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step: Waking up */}
        {currentStep === 'waking' && (
          <div data-testid="waking-step" className="mb-4 text-center py-4">
            {faceDescriptor && (
              <div className="flex justify-center mb-4" data-testid="face-preview-container">
                <FacePreview face={activeFace} size={120} state={STEP_TO_FACE_STATE[currentStep]} />
              </div>
            )}
            <p className="text-green-400 font-medium mb-3">Flash complete!</p>
            <p className="text-sm text-atelier-text-secondary mb-4">
              Unplug and replug your device to restart it.
            </p>

            {heartbeatStatus === 'polling' && (
              <div data-testid="heartbeat-polling" className="space-y-2">
                <div className="flex justify-center">
                  <span className="inline-block w-3 h-3 rounded-full bg-accent-sky animate-pulse" />
                </div>
                <p className="text-sm text-atelier-text-muted">
                  Waiting for {displayName} to come online...
                </p>
              </div>
            )}

            {heartbeatStatus === 'timeout' && (
              <div data-testid="heartbeat-timeout" className="space-y-2">
                <p className="text-sm text-amber-400 font-medium">
                  {displayName} hasn't responded yet.
                </p>
                <ul className="text-xs text-atelier-text-muted space-y-1 text-left mx-auto max-w-xs">
                  <li>- Make sure the device is plugged in and powered on</li>
                  <li>- Check that it's connected to WiFi</li>
                  <li>- Try unplugging and replugging the USB cable</li>
                </ul>
                <button
                  onClick={handleRetryHeartbeat}
                  className="mt-2 px-4 py-1.5 rounded-xl text-sm cursor-pointer bg-accent-sky/20 text-accent-sky hover:bg-accent-sky/30 transition-colors"
                  data-testid="retry-heartbeat"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step: Celebration */}
        {currentStep === 'celebration' && (
          <div data-testid="celebration-step" className="mb-4 text-center py-4 relative overflow-hidden">
            {/* Confetti */}
            <div className="absolute inset-0 pointer-events-none" data-testid="confetti">
              {confettiParticles.map(p => (
                <span
                  key={p.id}
                  className="absolute w-2 h-2 rounded-sm opacity-80"
                  style={{
                    backgroundColor: p.color,
                    left: `${p.left}%`,
                    top: '-8px',
                    animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
                  }}
                />
              ))}
            </div>
            <style>{`
              @keyframes confetti-fall {
                0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                100% { transform: translateY(350px) rotate(720deg); opacity: 0; }
              }
            `}</style>

            {faceDescriptor && (
              <div className="flex justify-center mb-3" data-testid="face-preview-container">
                <FacePreview face={activeFace} size={120} state={STEP_TO_FACE_STATE[currentStep]} />
              </div>
            )}

            <p className="text-2xl font-display font-bold text-atelier-text mb-2">
              {displayName}
            </p>
            {agentGreeting && (
              <p data-testid="agent-greeting" className="text-sm text-accent-sky/80 italic mb-2">
                Your agent will say: &ldquo;{agentGreeting}&rdquo;
              </p>
            )}
            <p className="text-sm text-atelier-text-secondary mb-4">
              Say "<span className="text-accent-sky font-medium">{wakeWord}</span>" to meet {displayName}!
            </p>
            <p className="text-xs text-atelier-text-muted mb-4">
              Your agent will learn more the more you talk to it.
            </p>

            <button
              onClick={onDashboard ?? onCancel}
              className="go-btn px-6 py-2.5 rounded-xl font-medium text-sm"
              data-testid="go-to-dashboard"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {/* Action buttons (hidden during celebration — has its own CTA) */}
        {currentStep !== 'celebration' && (
          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-sm cursor-pointer border border-atelier-text-muted/30 text-atelier-text-secondary hover:bg-atelier-surface/60 hover:text-atelier-text transition-colors"
            >
              Cancel
            </button>
            {currentStep === 'connect' && (
              <button
                onClick={onReady}
                disabled={isFlashing}
                className="go-btn px-4 py-2 rounded-xl font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Ready
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Single checklist item with animated check/pending state */
function ChecklistItem({
  done,
  label,
  doneLabel,
}: {
  done: boolean;
  label: string;
  doneLabel: string;
}) {
  return (
    <div className="flex items-center gap-2" data-testid="checklist-item">
      <span className={`flex items-center justify-center w-5 h-5 rounded-full text-xs flex-shrink-0 transition-colors duration-300 ${
        done ? 'bg-green-500 text-white' : 'bg-atelier-surface text-atelier-text-muted'
      }`}>
        {done ? '\u2713' : '\u25CB'}
      </span>
      <span className={`text-sm transition-colors duration-300 ${
        done ? 'text-green-400' : 'text-atelier-text-secondary'
      }`}>
        {done ? doneLabel : label}
      </span>
    </div>
  );
}
