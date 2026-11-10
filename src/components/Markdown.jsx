import { Fragment, useMemo } from 'react';
import { parseMarkdown, safeHref } from '../lib/markdown.js';

/** Link #muc trong tài liệu: cuộn tới tiêu đề thay vì đổi URL. */
function scrollToAnchor(e, href) {
  const el = document.getElementById(decodeURIComponent(href.slice(1)));
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Inline({ nodes }) {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'strong': return <strong key={i}><Inline nodes={n.children} /></strong>;
      case 'em': return <em key={i}><Inline nodes={n.children} /></em>;
      case 'code': return <code key={i}>{n.text}</code>;
      case 'link': {
        const href = safeHref(n.href);
        if (!href) return <Fragment key={i}><Inline nodes={n.children} /></Fragment>;
        if (href.startsWith('#')) {
          return <a key={i} href={href} onClick={(e) => scrollToAnchor(e, href)}><Inline nodes={n.children} /></a>;
        }
        return <a key={i} href={href} target="_blank" rel="noreferrer"><Inline nodes={n.children} /></a>;
      }
      default: return <Fragment key={i}>{n.text}</Fragment>;
    }
  });
}

function Blocks({ blocks }) {
  return blocks.map((b, i) => {
    switch (b.type) {
      case 'heading': {
        const Tag = `h${Math.min(b.level + 1, 6)}`; // # của tài liệu thành h2, dưới tiêu đề trang
        return <Tag key={i} id={b.id}><Inline nodes={b.children} /></Tag>;
      }
      case 'hr': return <hr key={i} />;
      case 'quote': return <blockquote key={i}><Blocks blocks={b.children} /></blockquote>;
      case 'code': return <pre key={i}><code>{b.text}</code></pre>;
      case 'table':
        return (
          <div key={i} className="table-scroll">
            <table>
              <thead><tr>{b.head.map((c, k) => <th key={k} scope="col"><Inline nodes={c} /></th>)}</tr></thead>
              <tbody>
                {b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}><Inline nodes={c} /></td>)}</tr>)}
              </tbody>
            </table>
          </div>
        );
      case 'list': {
        const Tag = b.ordered ? 'ol' : 'ul';
        return (
          <Tag key={i} start={b.ordered && b.start !== 1 ? b.start : undefined}>
            {b.items.map((item, k) => (
              <li key={k}>
                {item.length === 1 && item[0].type === 'paragraph'
                  ? <Inline nodes={item[0].children} />
                  : <Blocks blocks={item} />}
              </li>
            ))}
          </Tag>
        );
      }
      default: return <p key={i}><Inline nodes={b.children} /></p>;
    }
  });
}

/** Hiển thị chuỗi Markdown (tập con trong lib/markdown.js) thành React — không dùng innerHTML. */
export default function Markdown({ source }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return <Blocks blocks={blocks} />;
}
