import { useState, useCallback } from 'react';
import type { SkillPlan } from '../components/Skills/types';
import type { WSEvent, QuestionPayload } from '../types';
import { useWebSocket } from './useWebSocket';

export interface SkillStepProgress {
  stepId: string;
  stepType: string;
  status: 'started' | 'completed' | 'failed';
}

export interface SkillQuestionRequest {
  stepId: string;
  questions: QuestionPayload[];
}

export function useSkillSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<SkillStepProgress[]>([]);
  const [questionRequest, setQuestionRequest] = useState<SkillQuestionRequest | null>(null);
  const [outputs, setOutputs] = useState<string[]>([]);

  const handleEvent = useCallback((event: WSEvent) => {
    switch (event.type) {
      case 'skill_started':
        setRunning(true);
        setResult(null);
        setError(null);
        break;
      case 'skill_step':
        setSteps(prev => {
          const existing = prev.findIndex(s => s.stepId === event.step_id);
          const entry: SkillStepProgress = {
            stepId: event.step_id,
            stepType: event.step_type,
            status: event.status,
          };
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = entry;
            return updated;
          }
          return [...prev, entry];
        });
        break;
      case 'skill_question':
        setQuestionRequest({
          stepId: event.step_id,
          questions: event.questions,
        });
        break;
      case 'skill_output':
        setOutputs(prev => [...prev, event.content]);
        break;
      case 'skill_completed':
        setRunning(false);
        setResult(event.result);
        break;
      case 'skill_error':
        setRunning(false);
        setError(event.message);
        break;
    }
  }, []);

  // Delegate WebSocket lifecycle to the shared hook
  useWebSocket({ sessionId, onEvent: handleEvent });

  const startRun = useCallback(async (plan: SkillPlan, allSkills: Array<{ id: string; name: string; prompt: string; category: string; workspace?: Record<string, unknown> }>) => {
    setSteps([]);
    setOutputs([]);
    setResult(null);
    setError(null);
    setQuestionRequest(null);

    const res = await fetch('/api/skills/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, allSkills }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      setError(body.error || 'Failed to start skill run');
      return;
    }
    const { session_id } = await res.json();
    setSessionId(session_id);
  }, []);

  const answerQuestion = useCallback(async (stepId: string, answers: Record<string, unknown>) => {
    if (!sessionId) return;
    const res = await fetch(`/api/skills/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_id: stepId, answers }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      setError(body.error || 'Failed to submit answer');
    }
    setQuestionRequest(null);
  }, [sessionId]);

  return {
    sessionId,
    running,
    result,
    error,
    steps,
    outputs,
    questionRequest,
    startRun,
    answerQuestion,
  };
}
