import { useState, useEffect } from 'react';
import MinionAvatar from '../shared/MinionAvatar';

const PLANNING_MESSAGES = [
  'Reading your blocks...',
  'Thinking up a plan...',
  'Choosing the right minions...',
  'Mapping out the tasks...',
  'Figuring out the best order...',
  'Almost ready...',
];

export default function PlanningIndicator() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % PLANNING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <style>{`
        @keyframes planning-orbit {
          0% { transform: rotate(0deg) translateX(48px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(48px) rotate(-360deg); }
        }
        @keyframes planning-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes planning-fade {
          0% { opacity: 0; transform: translateY(6px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-6px); }
        }
        .planning-center {
          animation: planning-pulse 2s ease-in-out infinite;
        }
        .planning-orbit-1 { animation: planning-orbit 4s linear infinite; }
        .planning-orbit-2 { animation: planning-orbit 4s linear infinite; animation-delay: -1.33s; }
        .planning-orbit-3 { animation: planning-orbit 4s linear infinite; animation-delay: -2.66s; }
        .planning-message {
          animation: planning-fade 2.5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .planning-center,
          .planning-orbit-1,
          .planning-orbit-2,
          .planning-orbit-3,
          .planning-message {
            animation: none;
          }
        }
      `}</style>

      {/* Animated orbit with Elisa center and minion dots */}
      <div className="relative w-32 h-32">
        {/* Center: Elisa avatar */}
        <div className="absolute inset-0 flex items-center justify-center planning-center">
          <MinionAvatar name="Elisa" role="narrator" status="working" size="lg" />
        </div>

        {/* Orbiting dots representing future minions */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="planning-orbit-1">
            <div className="w-3 h-3 rounded-full bg-accent-sky shadow-sm shadow-accent-sky/40" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="planning-orbit-2">
            <div className="w-3 h-3 rounded-full bg-accent-mint shadow-sm shadow-accent-mint/40" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="planning-orbit-3">
            <div className="w-3 h-3 rounded-full bg-accent-lavender shadow-sm shadow-accent-lavender/40" />
          </div>
        </div>
      </div>

      {/* Rotating status messages */}
      <div className="h-8 flex items-center justify-center">
        <p
          key={messageIndex}
          className="text-sm font-medium text-atelier-text-secondary planning-message"
        >
          {PLANNING_MESSAGES[messageIndex]}
        </p>
      </div>

      {/* Subtle progress dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-accent-lavender/40"
            style={{
              animation: 'planning-pulse 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
