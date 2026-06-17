#!/usr/bin/env python3
"""
Merge selected Markdown files into a single high-quality HTML file with embedded CSS/JS.

Usage:
  python3 scripts/build_single_html.py

Output:
  build/中文写作手法.html
"""
import io
import os
from pathlib import Path
import sys
import re
import html as html_lib

try:
  import markdown
except Exception:
  print("Missing dependency: python-markdown. Please run: pip install markdown")
  raise

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'build'
OUT_DIR.mkdir(exist_ok=True)

# Files to include (order matters)
FILES = [
    'wiki/中文写作手法_摘要.md',
    'wiki/感官与意象手法.md',
    'wiki/克制与叙事手法.md',
    'wiki/逻辑与结构手法.md',
    'wiki/认知与翻转手法.md',
    'wiki/时空与对话手法.md',
]

def read_utf8(path: Path) -> str:
    return path.read_text(encoding='utf-8')

def normalize_markdown_index(text: str) -> str:
  # Fix summary-style blockquote + list blocks so markdown renders each item independently.
  def repl_blockquote_list(match):
    return match.group(1)[2:] + '\n\n' + match.group(2)
  text = re.sub(r'(^> .+)\n((?:- .*(?:\n|$))+)', repl_blockquote_list, text, flags=re.M)
  return text


def remove_unwanted_sections(text: str) -> str:
  return re.sub(r'(?m)^##\s*(?:关联阅读|关联原始数据源)\b.*?(?=^#{1,6}\s|\Z)', '', text, flags=re.S)


def build_combined_md(files):
  parts = []
  # Add anchors and section headings while preserving original markdown for copy
  for p in files:
    fp = ROOT / p
    if not fp.exists():
      print(f'Warning: {p} not found, skipping')
      continue
    text = read_utf8(fp)
    # Ensure there is a top-level heading for the section (use filename if none)
    first_line = text.strip().splitlines()[0] if text.strip() else ''
    if first_line.startswith('#'):
      parts.append('\n')
      parts.append(text)
    else:
      title = fp.stem
      parts.append(f'\n## {title}\n\n')
      parts.append(text)
  combined = '\n\n'.join(parts)
  combined = normalize_markdown_index(combined)
  combined = remove_unwanted_sections(combined)
  # Keep the main title, then trim to start from the directory index section.
  title_match = re.search(r'(?m)^#\s*中文写作手法\b', combined)
  index_match = re.search(r'(?m)^##\s*写作手法目录索引\b', combined)
  if title_match and index_match:
    combined = combined[title_match.start():title_match.end()] + '\n\n' + combined[index_match.start():].lstrip('\n')
  # Convert wiki-style links [[Page#Sub|Label]] or [[Page|Label]] to markdown anchors
  def slugify(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"\s+", '-', s)
    s = re.sub(r"[^0-9a-z\-\u4e00-\u9fff]+", '', s)
    s = re.sub(r'\-+', '-', s)
    return s

  def repl_wikilink(m):
    target = m.group(1)
    label = m.group(2)
    if '#' in target:
      page, sub = target.split('#', 1)
      slug = slugify(sub)
      display = label or sub
    else:
      page = target
      slug = slugify(page)
      display = label or page
    return f'[{display}](#{slug})'

  combined = re.sub(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", repl_wikilink, combined)
  return combined

CSS = r'''
/* Elegant Vanilla CSS - minimal, readable, high-contrast */
:root{--bg:#f7f6f3;--card:#ffffff;--accent:#7c3aed;--muted:#6b7280;--text:#111827}
*{box-sizing:border-box}
html,body{height:100%;margin:0;font-family:Inter, ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial; background:var(--bg);color:var(--text)}
.container{max-width:1100px;margin:36px auto;padding:24px}
.content{padding:28px;background:var(--card);border-radius:12px;box-shadow:0 8px 30px rgba(16,24,40,0.06);overflow:auto}
.copy-btn{margin-left:10px;padding:4px 8px;border-radius:8px;border:none;background:#eef2ff;color:var(--accent);cursor:pointer;font-weight:600}
.copy-btn:active{transform:translateY(1px)}
.content h1{font-size:28px;margin-top:0}
.content h2{font-size:20px;margin-top:28px;border-left:4px solid #eef2ff;padding-left:12px}
.content h3{font-size:16px;margin-top:20px}
.content p{line-height:1.65;color:#273043}
pre{background:#0f1724;color:#e6edf3;padding:12px;border-radius:8px;overflow:auto}
code{background:#f3f4f6;padding:2px 6px;border-radius:6px}
.meta{color:var(--muted);font-size:13px;margin-bottom:8px}
.footer{font-size:13px;color:var(--muted);margin-top:24px}
@media (max-width:900px){.container{padding:12px}}
'''

JS = r'''
function q(sel){return document.querySelector(sel)}
function qAll(sel){return Array.from(document.querySelectorAll(sel))}
// Search: filter TOC and highlight content
document.addEventListener('DOMContentLoaded', ()=>{
  const input = q('#search');
  if(input){
    input.addEventListener('input', ()=>{
      const v = input.value.trim().toLowerCase();
      const items = qAll('.toc a');
      items.forEach(a=>{
        const text = a.textContent.trim().toLowerCase();
        a.style.display = text.includes(v) ? 'block' : (v? 'none':'block');
      });
    });
  }
  // Smooth scrolling for anchor links
  qAll('.toc a').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
      history.replaceState(null,'', '#'+id);
    });
  });

  function copyToClipboard(text){
    function fallbackCopy(){
      return new Promise((resolve,reject)=>{
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try{
          const successful = document.execCommand('copy');
          document.body.removeChild(ta);
          successful ? resolve() : reject(new Error('copy failed'));
        }catch(err){
          document.body.removeChild(ta);
          reject(err);
        }
      });
    }

    if(navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text).catch(()=> fallbackCopy());
    }
    return fallbackCopy();
  }

  // Copy button handler
  document.body.addEventListener('click', async (e)=>{
    const btn = e.target.closest('.copy-btn');
    if(!btn) return;
    const tid = btn.dataset.target;
    if(!tid) return;
    const tpl = document.getElementById(tid);
    if(!tpl) return;
    const text = tpl.textContent || tpl.innerText || '';
    if(!text) return;
    try{
      await copyToClipboard(text);
      const orig = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(()=> btn.textContent = orig, 1200);
    }catch(err){
      console.error('copy failed', err);
    }
  });
});
'''

HTML_TMPL = '''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>中文写作手法 — 合集</title>
  <style>{css}</style>
</head>
<body>
  <div class="container">
    <main class="content">{content}</main>
  </div>
  <script>{js}</script>
</body>
</html>'''

def main():
  combined = build_combined_md(FILES)

  # Extract sections by level-2 headings to keep original markdown for copy
  section_re = re.compile(r'(^##\s+(.*)$)(.*?)(?=^##\s+|\Z)', re.M | re.S)
  sections = {}
  def slugify(s: str) -> str:
    s = s.strip()
    s = re.sub(r"\s+", '-', s)
    s = re.sub(r"[^0-9a-zA-Z\-\u4e00-\u9fff]+", '', s)
    s = re.sub(r'\-+', '-', s)
    return s.lower()

  for m in section_re.finditer(combined):
    heading_line = m.group(2).strip()
    slug = slugify(heading_line)
    md_block = m.group(0).strip()
    sections[slug] = md_block

  md = markdown.Markdown(extensions=['fenced_code','codehilite','tables','toc'])
  html = md.convert(combined)
  # We'll build TOC from the final HTML after injecting stable ids

  # Inject stable ids into headings and add copy buttons for level-2 headings
  def add_ids_and_copy(html_text: str, sections_map: dict, combined_source: str) -> str:
    # Replace heading tags with id based on their text (strip inner tags)
    current_h2 = {'slug': None}
    current_page = {'title': None}
    def strip_number_prefix(value: str) -> str:
      value = value.strip()
      value = re.sub(r'^\s*\d+[\.\)\、\s]+', '', value)
      # remove parenthetical synonyms such as （顶真） or (翻转句 / 判决句)
      value = re.sub(r'[（\(][^）\)]*[）\)]', '', value)
      value = re.sub(r'[（\)\/\|：:]+', ' ', value)
      return re.sub(r'\s+', ' ', value).strip()

    def heading_repl(m):
      tag = m.group('tag')
      inner = m.group('inner')
      # strip tags to get plain text
      plain = re.sub(r'<.*?>', '', inner).strip()
      base = slugify(plain)
      alias = ''
      if tag == 'h1':
        current_page['title'] = plain
      if tag == 'h2':
        stripped = strip_number_prefix(plain)
        if stripped and stripped != base:
          alias = stripped
      # build hierarchical slug: h2 becomes current parent; h3+ prefixed with parent h2
      if tag == 'h2':
        slug = base
        current_h2['slug'] = slug
      elif tag in ('h3','h4','h5','h6') and current_h2['slug']:
        slug = f"{current_h2['slug']}-{base}"
      else:
        slug = base
      # for h2, add copy button (removed for now)
      if tag == 'h2' and re.match(r'^\s*\d+[\.\)\、\s]+', plain):
        btn = ''
      else:
        btn = ''
      alias_anchor = f'<a id="{slugify(alias)}"></a>' if alias else ''
      return f'{alias_anchor}<{tag} id="{slug}">{inner}{btn}</{tag}>'

    pattern = re.compile(r'<(?P<tag>h[1-6])[^>]*>(?P<inner>.*?)</(?P=tag)>', re.S)
    new_html = pattern.sub(heading_repl, html_text)

    # Append templates for each h2 heading by locating its original markdown in the combined source
    templates = []
    # find all h2 ids and visible text
    h2_re = re.compile(r'<h2 id="([^"]+)">(.*?)</h2>', re.S)
    for m2 in h2_re.finditer(new_html):
      hid = m2.group(1)
      inner = m2.group(2)
      # remove button entirely
      inner_label = re.sub(r'<button.*?>.*?</button>', '', inner, flags=re.S)
      label = re.sub(r'<.*?>', '', inner_label).strip()
      # try to find the markdown block in the combined source
      md_block = None
      try:
        pattern = re.compile(r'(^##\s+' + re.escape(label) + r'.*$)(.*?)(?=^##\s+|\Z)', re.M | re.S)
        mmd = pattern.search(combined_source)
        if mmd:
          md_block = (mmd.group(1) + mmd.group(2)).strip()
      except Exception:
        md_block = None
      if not md_block:
        # fallback: use any available sections_map entry for this id
        md_block = sections_map.get(hid, '')
      escaped = html_lib.escape(md_block)
      templates.append(f'<template id="md-{hid}">{escaped}</template>')
    new_html += '\n' + '\n'.join(templates)
    return new_html

  content_html = add_ids_and_copy(html, sections, combined)

  # Build hierarchical TOC from headings in content_html
  def build_toc_from_content(html_text: str) -> str:
    hdr_re = re.compile(r'<(h[1-6]) id="([^"]+)">(.*?)</\1>', re.S)
    parts = []
    stack = []  # holds current open levels
    parts.append('<ul>')
    prev_level = 1
    for m in hdr_re.finditer(html_text):
      level = int(m.group(1)[1])
      hid = m.group(2)
      # remove any button elements (and their inner text) before extracting label
      inner_no_btn = re.sub(r'<button.*?>.*?</button>', '', m.group(3), flags=re.S)
      label = re.sub(r'<.*?>', '', inner_no_btn).strip()
      # adjust stack
      if level > prev_level:
        for _ in range(level - prev_level):
          parts.append('<ul>')
      elif level < prev_level:
        for _ in range(prev_level - level):
          parts.append('</ul>')
      parts.append(f'<li><a href="#%s">%s</a></li>' % (hid, label))
      prev_level = level
    # close remaining
    for _ in range(prev_level - 1):
      parts.append('</ul>')
    parts.append('</ul>')
    return '\n'.join(parts)

  toc_html = build_toc_from_content(content_html)
  out = HTML_TMPL.format(css=CSS, toc=toc_html, content=content_html, js=JS)
  out_path = OUT_DIR / '中文写作手法.html'
  out_path.write_text(out, encoding='utf-8')
  print(f'Wrote: {out_path}')

if __name__ == '__main__':
    main()
