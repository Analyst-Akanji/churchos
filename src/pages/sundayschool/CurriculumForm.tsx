import { useNavigate, useParams } from 'react-router-dom';
import QuarterBuilder from '@/pages/admin/QuarterBuilder';

/** One page for both setting up the next quarter (no id) and editing a quarter. */
export default function CurriculumForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const back = () => navigate('/app/sunday-school/curriculum');
  return <QuarterBuilder quarterId={id} onSaved={back} onCancel={back} />;
}
