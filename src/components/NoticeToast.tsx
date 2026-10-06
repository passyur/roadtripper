import { useEffect } from 'react';
import { useNotice } from '../store/useNotice';
import { ExternalIcon, XIcon } from './icons';

export function NoticeToast() {
  const { notice, dismiss } = useNotice();

  useEffect(() => {
    if (!notice || notice.tone === 'error') return;
    const t = setTimeout(dismiss, 6000);
    return () => clearTimeout(t);
  }, [notice, dismiss]);

  if (!notice) return null;
  return (
    <div className={`toast toast--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      <span>{notice.text}</span>
      {notice.link && (
        <a href={notice.link.href} target="_blank" rel="noreferrer">
          {notice.link.label} <ExternalIcon />
        </a>
      )}
      <button className="icon-button" onClick={dismiss} aria-label="Dismiss"><XIcon /></button>
    </div>
  );
}
