---
marp: true
theme: uncover
paginate: true
header: 'Presentation Title'
footer: '© 2025 Your Name'
style: |
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=JetBrains+Mono&display=swap');

  :root {
    --main-font: 'Roboto', sans-serif;
    --code-font: 'JetBrains Mono', monospace;
    --background-start: #1a2a6c;
    --background-end: #000000;
    --text-color: #e0e0e0;
    --accent-color: #00f2fe;
    --accent-darker: #00c1cb;
    --header-footer-bg: rgba(0, 0, 0, 0.2);
  }

  section {
    background: linear-gradient(135deg, var(--background-start), var(--background-end));
    font-family: var(--main-font);
    color: var(--text-color);
    padding: 60px;
  }

  h1, h2, h3 {
    color: var(--accent-color);
    text-shadow: 0 0 5px var(--accent-darker), 0 0 10px rgba(0, 242, 254, 0.3);
    margin-bottom: 0.8em;
  }

  h1 {
    font-size: 3.5em;
    text-align: center;
  }

  h2 {
    font-size: 2.5em;
    border-bottom: 2px solid var(--accent-darker);
    padding-bottom: 0.3em;
  }

  a {
    color: var(--accent-color);
    text-decoration: none;
    transition: color 0.3s ease;
  }

  a:hover {
    color: #ffffff;
    text-decoration: underline;
  }

  p, ul, ol {
    font-size: 1.2em;
    line-height: 1.6;
  }

  pre, code {
    font-family: var(--code-font);
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 5px;
  }

  pre {
    padding: 1em;
  }

  header, footer {
    font-family: var(--main-font);
    background-color: var(--header-footer-bg);
    color: var(--text-color);
    padding: 5px 20px;
  }
---

<!-- _class: lead -->
# Futuristic Presentation
## A Marp Theme for the Future
**Press 'space' to start**

---

## About This Template

This is a modern, futuristic theme for Marp.

- **Dark Mode:** Easy on the eyes.
- **Vibrant Accent:** High-contrast colors for readability.
- **Clean Fonts:** Using Google Fonts for a professional look.
- **Gradient Background:** Adds a subtle, dynamic feel.

---

## Code Blocks

Code is styled to be clear and readable, using a monospaced font.

```javascript
// server.js
const http = require('http');

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello, Future!\n');
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Server running...');
});
```

---

## Final Slide

Thank you for your attention!

[Link to a website](https://marp.app/)

