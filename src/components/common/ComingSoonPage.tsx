import type { ReactNode } from 'react';
import './ComingSoonPage.css';

type Props = {
  title: string;
  header: ReactNode;
};

export default function ComingSoonPage({ title, header }: Props) {
  return (
    <>
      {header}
      <section className="scroll-content coming-soon-content" aria-label={title}>
        <div className="coming-soon-card">
          <h2>{title}</h2>
          <p>{title} 기능을 준비 중입니다.</p>
        </div>
      </section>
    </>
  );
}
