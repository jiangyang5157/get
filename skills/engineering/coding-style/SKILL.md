---
name: coding-style
description: Apply coding style guidelines including immutability, KISS/DRY/YAGNI principles, file organization, error handling, and naming conventions. Use when writing new code, reviewing code, or refactoring to ensure consistent code quality.
---

# Coding Style Guidelines

## Philosophy

Clean code is readable, maintainable, and predictable. These guidelines ensure consistency across the codebase and prevent common pitfalls that lead to bugs and technical debt.

**Core principle**: Write code for humans first, machines second. Every line should communicate intent clearly.

## Critical Rules

### Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones.

See [immutability.md](immutability.md) for complete guidelines and examples.

### File Organization

MANY SMALL FILES > FEW LARGE FILES.

See [file-organization.md](file-organization.md) for complete organization strategies.

## Core Principles

### KISS (Keep It Simple)

Prefer the simplest solution that actually works. Optimize for clarity over cleverness.

See [principles.md](principles.md) for detailed explanations.

### DRY (Don't Repeat Yourself)

Extract repeated logic into shared functions. Wait for 3+ occurrences before abstracting.

See [principles.md](principles.md) for detailed guidelines.

### YAGNI (You Aren't Gonna Need It)

Do not build features or abstractions before they are needed. Start simple, refactor when pressure is real.

See [principles.md](principles.md) for detailed guidelines.

## Standards

### Error Handling

ALWAYS handle errors comprehensively:

- Handle errors explicitly at every level
- Provide user-friendly error messages in UI-facing code
- Log detailed error context on the server side
- Never silently swallow errors

```typescript
// WRONG: Silent error swallowing
try {
  await saveToDatabase(data);
} catch (error) {
  // Empty catch block - error is lost!
}

// WRONG: Generic error message
try {
  await saveToDatabase(data);
} catch (error) {
  alert('Something went wrong');
}

// CORRECT: Explicit handling with context
try {
  await saveToDatabase(data);
} catch (error) {
  logger.error('Failed to save user data', {
    userId: data.userId,
    error: error.message,
    stack: error.stack
  });
  throw new UserError('Unable to save your changes. Please try again.');
}
```

### Input Validation

ALWAYS validate at system boundaries:

- Validate all user input before processing
- Use schema-based validation where available (Zod, Yup, Joi)
- Fail fast with clear error messages
- Never trust external data (API responses, user input, file content)

```typescript
import { z } from 'zod';

// Define schema
const UserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().min(0).max(150)
});

// WRONG: No validation
function createUser(input: any) {
  return db.insert('users', input);
}

// CORRECT: Validate at boundary
function createUser(input: unknown) {
  const validated = UserSchema.parse(input); // Throws if invalid
  return db.insert('users', validated);
}
```

### Naming Conventions

Use descriptive names that reveal intent:

- **Variables and functions**: `camelCase` with descriptive names
- **Booleans**: prefer `is`, `has`, `should`, or `can` prefixes
- **Interfaces, types, and components**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Custom hooks**: `camelCase` with a `use` prefix

```typescript
// WRONG: Unclear names
const d = new Date();
const x = data.filter(i => i.s);
function proc(d) { /* ... */ }

// CORRECT: Descriptive names
const currentDate = new Date();
const activeUsers = data.filter(user => user.isActive);
function processOrder(order: Order) { /* ... */ }

// Boolean naming
const isValid = checkValidation(data);
const hasPermission = user.roles.includes('admin');
const shouldRetry = attemptCount < maxRetries;
const canEdit = user.id === post.authorId;
```

## Code Smells to Avoid

### Deep Nesting

Prefer early returns over nested conditionals (>3 levels triggers refactoring).

See [code-smells.md](code-smells.md) for examples and solutions.

### Magic Numbers

Use named constants for meaningful thresholds, delays, and limits.

See [code-smells.md](code-smells.md) for examples.

### Long Functions

Split large functions into focused pieces (<50 lines target).

See [code-smells.md](code-smells.md) for extraction techniques.

## Quality Checklist

Before marking work complete, verify:

- [ ] Code is readable and well-named (intent is clear from names)
- [ ] Functions are small (<50 lines typical)
- [ ] Files are focused (<800 lines maximum)
- [ ] No deep nesting (>3 levels triggers refactoring)
- [ ] Proper error handling (no silent failures)
- [ ] No hardcoded values (use constants or config)
- [ ] No mutation (immutable patterns used throughout)
- [ ] Input validated at boundaries
- [ ] No duplicated logic (DRY principle applied)
- [ ] No speculative abstractions (YAGNI principle applied)

## When to Apply

Apply these guidelines when:

- **Writing new code**: Follow from the start
- **Code review**: Check against the quality checklist
- **Refactoring**: Use as improvement targets
- **User requests**: "clean code", "best practices", "code quality", "refactor this"

Remember: These are guidelines, not rigid rules. Context matters. When in doubt, prioritize readability and maintainability.
