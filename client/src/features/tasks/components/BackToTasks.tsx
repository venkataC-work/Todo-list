import { Link } from 'react-router';
import { ArrowLeftIcon } from '@/shared/ui/icons';
import { useTaskNavigation } from '../hooks/use-task-navigation';

export const BackToTasks = () => {
  const { listPath } = useTaskNavigation();
  return (
    <Link to={listPath} className="back-link">
      <ArrowLeftIcon width={16} height={16} /> All tasks
    </Link>
  );
};
