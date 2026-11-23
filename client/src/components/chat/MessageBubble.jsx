import MaskedText from './MaskedText';
import Markdown from './Markdown';

export default function MessageBubble({ message }) {
  if (message.role === 'user') {
    return (
      <li className="ml-auto w-fit max-w-[75%] rounded-md border border-line bg-surface px-4 py-3">
        <MaskedText text={message.content} />
      </li>
    );
  }
  return (
    <li className="w-full rounded-lg border border-line bg-bg/90 px-5 py-4 shadow-lg shadow-black/30 backdrop-blur-sm">
      <Markdown text={message.content} />
    </li>
  );
}