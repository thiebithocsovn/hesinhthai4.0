import type { GradableQuestion } from './examManualGrading';

export interface ChoiceQuestion extends GradableQuestion {
  options: string[];
  correctAnswer: number;
}

/** Only questions answered by choosing an option belong in the answer grid. */
export function choiceQuestionOptions(question: ChoiceQuestion): string[] | null {
  if (question.type === 'question_engine') {
    const payload = question.engineQuestion?.payload;
    if (payload?.type === 'single_choice' || payload?.type === 'multiple_choice') return payload.options.map(option => option.text);
    return payload?.type === 'true_false' ? ['Đúng', 'Sai'] : null;
  }
  return !question.type || question.type === 'multiple_choice' ? question.options : null;
}

export function choiceQuestionEntries<Q extends ChoiceQuestion>(questions: readonly Q[]) {
  return questions.flatMap((question, index) => {
    const options = choiceQuestionOptions(question);
    return options?.length && options.length <= 8 ? [{ question, number: index + 1, options }] : [];
  });
}

interface VersionedExam<Q extends ChoiceQuestion> {
  questions: Q[];
  shuffledVersions?: { code: string; questions: Q[] }[];
}

/** Keep version codes and ordering while bringing every version up to date after an edit. */
export function synchronizeExamVersions<Q extends ChoiceQuestion, E extends VersionedExam<Q>>(exam: E, previousExam: VersionedExam<Q>): E {
  if (!exam.shuffledVersions?.length) return exam;
  const current = new Map(exam.questions.map(question => [question.id, question]));
  const previous = new Map(previousExam.questions.map(question => [question.id, question]));
  const shuffledVersions = exam.shuffledVersions.map(version => {
    const seen = new Set<string>();
    const order = [...version.questions, ...exam.questions].filter(question => {
      if (!current.has(question.id) || seen.has(question.id)) return false;
      seen.add(question.id);
      return true;
    });
    const questions = order.map(oldVersionQuestion => {
      const question = current.get(oldVersionQuestion.id)!;
      // Question-engine options are stored in its payload; written questions have no option permutation.
      if (question.type && question.type !== 'multiple_choice') return question;
      const oldOriginal = previous.get(question.id);
      if (!oldOriginal || oldOriginal.options.length !== question.options.length || oldVersionQuestion.options.length !== question.options.length) return question;
      const used = new Set<number>();
      const permutation = oldVersionQuestion.options.map(option => {
        const index = oldOriginal.options.findIndex((text, candidate) => text === option && !used.has(candidate));
        if (index >= 0) used.add(index);
        return index;
      });
      if (permutation.some(index => index < 0)) return question;
      return { ...question, options: permutation.map(index => question.options[index]), correctAnswer: permutation.indexOf(question.correctAnswer) };
    });
    return { ...version, questions };
  });
  return { ...exam, shuffledVersions };
}
