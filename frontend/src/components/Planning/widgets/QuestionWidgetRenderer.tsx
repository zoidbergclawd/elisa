import type { QuestionWidget } from '../../../types';
import SingleSelectWidget from './SingleSelectWidget';
import MultiSelectWidget from './MultiSelectWidget';
import RankPrioritiesWidget from './RankPrioritiesWidget';

export interface QuestionWidgetRendererProps {
  question: QuestionWidget;
  onAnswer: (value: string | string[]) => void;
}

export default function QuestionWidgetRenderer({
  question,
  onAnswer,
}: QuestionWidgetRendererProps) {
  switch (question.type) {
    case 'single_select':
      return (
        <SingleSelectWidget
          question={question.text}
          options={question.options}
          onSelect={(value) => onAnswer(value)}
        />
      );
    case 'multi_select':
      return (
        <MultiSelectWidget
          question={question.text}
          options={question.options}
          onSubmit={(values) => onAnswer(values)}
        />
      );
    case 'rank_priorities':
      return (
        <RankPrioritiesWidget
          question={question.text}
          options={question.options}
          onSubmit={(rankedValues) => onAnswer(rankedValues)}
        />
      );
    default: {
      const _exhaustive: never = question.type;
      return <p className="text-sm text-red-400">Unknown question type: {_exhaustive}</p>;
    }
  }
}
