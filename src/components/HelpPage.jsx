import guide from '../../docs/HUONG_DAN_SU_DUNG.md?raw';
import Markdown from './Markdown.jsx';

/** Thẻ "Hướng dẫn sử dụng": hiển thị docs/HUONG_DAN_SU_DUNG.md ngay trong ứng dụng. */
export default function HelpPage() {
  return (
    <article className="card help-doc">
      <Markdown source={guide} />
    </article>
  );
}
