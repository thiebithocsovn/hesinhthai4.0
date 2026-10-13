import ExamManagerLegacy from './ExamManagerLegacy';
import UnifiedStudentExamRunner from './UnifiedStudentExamRunner';

interface ExamManagerProps {
  onBack: () => void;
  initialMode?: 'landing' | 'teacher' | 'student';
  currentUser?: any;
}

export default function ExamManager(props: ExamManagerProps) {
  if (props.initialMode === 'student') {
    return <UnifiedStudentExamRunner onBack={props.onBack} />;
  }
  return <ExamManagerLegacy {...props} />;
}
