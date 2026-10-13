# ReadLab Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent content work and inline execution for the app. Track completed tasks below.

**Goal:** Mobile focused TOEIC reading PWA for a 600–750 learner targeting 850+, deployed to GitHub Pages.
**Architecture:** Static ES modules. Original content and supplemental reading data are isolated from a pure learning engine and DOM based app.
**Tech Stack:** HTML, CSS, JavaScript ES modules, service worker, Node built-in tests.
**Spec:** docs/design.md

## Global constraints
- Original HTML must be preserved.
- No paid services, credentials in source, or required build dependencies.
- Use relative asset paths for GitHub Pages subdirectory hosting.
- User explicitly authorized publication to GitHub Pages.
- Learning records stay in browser; export/import moves them between devices.

## Review focus
- Corrupt or malicious imported records must not break startup or inject markup.
- First wrong attempt must remain reflected in statistics after successful review.
- Multi-question reading sets must retain their source passage and complete question group.
- Timed sessions must use elapsed wall time after backgrounding and reveal answers after submission.
- Offline caching must cover all dynamic content and avoid deleting other apps' caches.

## Tasks
- [ ] 1. Extract original lessons and 97 questions, correct content issues, validate structure. Files: scripts/extract-handbook.py, data/handbook.mjs.
- [ ] 2. Write original advanced reading sets, vocabulary, and 28 day plan. File: data/reading.mjs. Shared question fields: id, chapter, part (5/6/7), stem, options (4 HTML strings), answer (0–3), explanation (HTML), passage (HTML or empty), passageTitle, setId. Reading set fields: id, part, title, description, minutes, passage, questions. Vocabulary fields: id, term, pos, meaning, example, translation, collocation.
- [ ] 3. Test then implement learning state, answer recording, wrong-review schedule, import validation, session selection. Files: tests/engine.test.mjs, engine.mjs.
- [ ] 4. Implement responsive app, complete study and practice flows, PWA and local preview. Files: index.html, styles.css, app.mjs, sw.js, manifest.webmanifest, icons/*, scripts/serve.mjs.
- [ ] 5. Review content and behavior, run meaningful tests and browser checks, fix findings. Document validation in README.md.
- [ ] 6. Create dedicated repository, commit/push app, enable GitHub Pages, verify public deployment and deliver URL.
