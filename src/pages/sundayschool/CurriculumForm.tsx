import { useNavigate, useParams } from 'react-router-dom';
import QuarterBuilder from '../../admin/QuarterBuilder';

/** One page for both creating the next quarter (no id) and editing a quarter's topics. */
export default function CurriculumForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <QuarterBuilder quarterId={id} onSaved={() => navigate('/app/sunday-school/curriculum')} />;
}
