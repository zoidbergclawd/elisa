import type { UIState } from '../../types';

interface GoButtonProps {
  disabled: boolean;
  onClick: () => void;
  onStop?: () => void;
  uiState?: UIState;
}

export default function GoButton({ disabled, onClick, onStop, uiState }: GoButtonProps) {
  const isBuilding = uiState === 'building';
  const isReady = !disabled && (!uiState || uiState === 'design');

  if (isBuilding && onStop) {
    return (
      <button
        onClick={onStop}
        aria-label="Stop build"
        className="go-btn go-btn-stop px-8 py-2 text-base rounded-xl cursor-pointer"
      >
        STOP
      </button>
    );
  }

  const stateClass = isBuilding
    ? 'go-btn-building'
    : isReady
      ? 'go-btn-ready'
      : '';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Start build"
      className={`go-btn px-8 py-2 text-base rounded-xl cursor-pointer ${stateClass} ${
        isReady ? 'animate-breathe-mint' : ''
      }`}
    >
      GO
    </button>
  );
}
