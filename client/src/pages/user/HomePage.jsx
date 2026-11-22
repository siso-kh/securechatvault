import { useNavigate } from 'react-router-dom';
import Composer from '../../components/chat/Composer';

export default function HomePage() {
  const navigate = useNavigate();

  // Step 6 will create the conversation; for now we just pass the first message along
  const start = (text) => navigate('/chat', { state: { firstMessage: text } });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-5xl">Vault</h1>
      <div className="w-full max-w-xl">
        <Composer onSend={start} />
      </div>
    </div>
  );
}