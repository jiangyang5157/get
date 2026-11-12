---
name: eli5
description: "Explain a topic for a complete beginner with a simple visual story. Use when the user types /eli5 <topic>, asks for an ELI5 explanation, or wants a dead-simple picture explainer of how something works."
argument-hint: "[topic]"
disable-model-invocation: true
---

# eli5

Create a self-contained HTML explainer for someone who knows nothing about the topic.

## Workflow

1. Identify the one main idea the learner should remember. Omit secondary details unless they are needed to make that idea accurate.
2. Start with a familiar, concrete analogy. Map each important part of the analogy to the real concept, and call out where the analogy stops being exact.
3. Show the mechanism as a short sequence of 3-6 steps. Prefer labeled shapes, arrows, icons, or simple diagrams over paragraphs.
4. Use plain language: short sentences, common words, and one new term at a time. Define each unavoidable technical term immediately.
5. Add one tiny example or interaction that lets the learner see the idea in action. Keep it optional and simple.
6. End with a compact “remember this” summary and one gentle check-for-understanding question.

## Output

- Produce one standalone `.html` file with inline CSS and JavaScript only: no build step, no network requests, no external assets.
- Name it after the topic, such as `react-hooks.html`, save it in the workspace root, and give the path in the reply.
- Make the page readable on mobile and desktop: large type, strong contrast, generous spacing, and responsive diagrams.
- Use a small number of purposeful visual elements. Do not replace explanation with decorative gradients, stock imagery, or dense UI.
- Keep visible text short. Aim for one screenful of core explanation, followed by the example and summary.
- If the topic is ambiguous, state the assumed meaning in one sentence and proceed; ask a question only when different meanings would produce fundamentally different explanations.
- In the reply, name the core idea the explainer teaches in one sentence.
