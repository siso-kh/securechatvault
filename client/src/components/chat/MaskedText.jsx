import Tag from '../common/Tag';

const TOKEN = /(\[[A-Z_]+\])/g;

export default function MaskedText({ text }) {
  return (
        <p className="m-0 whitespace-pre-wrap text-sm leading-7">
          {text.split(TOKEN).map((part, i) =>
            /^\[[A-Z_]+\]$/.test(part) ? (
              <span key={i} className="mx-0.5 inline-block align-middle">
                <Tag>{part.slice(1, -1)}</Tag>
              </span>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </p>
  );
}