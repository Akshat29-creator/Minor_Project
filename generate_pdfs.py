import os
import subprocess
import markdown

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

CSS_STYLE = """
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  @page {
    size: A4;
    margin: 20mm 18mm 20mm 18mm;
    @bottom-right {
      content: counter(page);
    }
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1e293b;
    line-height: 1.6;
    font-size: 11pt;
    padding: 0;
    margin: 0;
  }

  h1, h2, h3, h4 {
    color: #0f172a;
    font-weight: 700;
    page-break-after: avoid;
  }

  h1 {
    font-size: 22pt;
    border-bottom: 2px solid #0284c7;
    padding-bottom: 6px;
    margin-top: 0;
    margin-bottom: 14px;
    color: #0369a1;
  }

  h2 {
    font-size: 15pt;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
    margin-top: 20px;
    margin-bottom: 10px;
    color: #0f172a;
  }

  h3 {
    font-size: 12.5pt;
    margin-top: 16px;
    margin-bottom: 6px;
    color: #334155;
  }

  p {
    margin-top: 0;
    margin-bottom: 10px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }

  th, td {
    border: 1px solid #cbd5e1;
    padding: 7px 10px;
    text-align: left;
  }

  th {
    background-color: #f1f5f9;
    color: #0f172a;
    font-weight: 600;
  }

  tr:nth-child(even) {
    background-color: #f8fafc;
  }

  pre {
    background-color: #0f172a;
    color: #f8fafc;
    padding: 12px 14px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
    font-size: 8.5pt;
    line-height: 1.45;
    overflow-x: auto;
    page-break-inside: avoid;
    margin: 12px 0;
  }

  code {
    font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
    font-size: 9pt;
    background-color: #f1f5f9;
    color: #0369a1;
    padding: 2px 5px;
    border-radius: 4px;
  }

  pre code {
    background-color: transparent;
    color: inherit;
    padding: 0;
  }

  blockquote {
    margin: 14px 0;
    padding: 10px 16px;
    background-color: #f0fdf4;
    border-left: 4px solid #16a34a;
    color: #14532d;
    font-style: italic;
    page-break-inside: avoid;
  }

  ul, ol {
    margin-top: 4px;
    margin-bottom: 10px;
    padding-left: 22px;
  }

  li {
    margin-bottom: 4px;
  }

  hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 20px 0;
  }
</style>
"""

def convert_md_to_pdf(md_filename, pdf_filename):
    print(f"[CONVERTING] {md_filename} -> {pdf_filename}")
    with open(md_filename, "r", encoding="utf-8") as f:
        md_text = f.read()

    html_content = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "nl2br", "sane_lists"]
    )

    full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{os.path.splitext(pdf_filename)[0]}</title>
{CSS_STYLE}
</head>
<body>
{html_content}
</body>
</html>
"""

    temp_html = md_filename.replace(".md", "_temp.html")
    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(full_html)

    abs_html = os.path.abspath(temp_html)
    abs_pdf = os.path.abspath(pdf_filename)

    cmd = [
        CHROME_PATH,
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={abs_pdf}",
        f"file:///{abs_html.replace(os.sep, '/')}"
    ]

    subprocess.run(cmd, check=True)
    if os.path.exists(temp_html):
        os.remove(temp_html)

    size = os.path.getsize(abs_pdf)
    print(f"[SUCCESS] Created {pdf_filename} ({size / 1024:.1f} KB)")

if __name__ == "__main__":
    convert_md_to_pdf("HARDWARE_SPECIFICATION_AND_BOM.md", "HARDWARE_SPECIFICATION_AND_BOM.pdf")
    convert_md_to_pdf("PROJECT_OVERVIEW_AND_NOVELTY.md", "PROJECT_OVERVIEW_AND_NOVELTY.pdf")
