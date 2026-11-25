import type { AdviceList } from './rules';

/** Domain notation as the hi-fi shows it: RL, RI with a subscript C, T or E. */
export function Notation({ list }: { list: AdviceList }) {
  if (list === 'RL') return <>RL</>;
  return (
    <>
      RI<sub>{list.slice('RI_'.length)}</sub>
    </>
  );
}
