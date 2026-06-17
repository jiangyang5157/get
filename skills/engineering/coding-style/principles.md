# Core Principles: KISS, DRY, YAGNI

## KISS (Keep It Simple)

**Philosophy**: Prefer the simplest solution that actually works. Optimize for clarity over cleverness.

### Guidelines

- Avoid premature optimization
- If you can't explain it simply, it's too complex
- Choose boring technology when possible
- Favor readability over brevity

### Example

```typescript
// WRONG: Overly clever one-liner
const result = data.filter(x => x.active).map(x => x.value).reduce((a, b) => a + b, 0);

// CORRECT: Clear step-by-step
const activeItems = data.filter(item => item.active);
const values = activeItems.map(item => item.value);
const total = values.reduce((sum, value) => sum + value, 0);
```

### Signs You're Violating KISS

- Code requires comments to understand
- You need to trace through multiple layers of abstraction
- Junior developers can't understand it without explanation
- The solution uses advanced features when simple ones work

---

## DRY (Don't Repeat Yourself)

**Philosophy**: Every piece of knowledge must have a single, unambiguous representation.

### Guidelines

- Extract repeated logic into shared functions or utilities
- Avoid copy-paste implementation drift
- Introduce abstractions when repetition is real (3+ occurrences), not speculative
- Balance DRY with simplicity - don't over-abstract

### Example

```typescript
// WRONG: Duplicated validation logic
function createUser(data) {
  if (!data.email || !isValidEmail(data.email)) {
    throw new Error('Invalid email');
  }
  // ...
}

function updateUser(id, data) {
  if (!data.email || !isValidEmail(data.email)) {
    throw new Error('Invalid email');
  }
  // ...
}

// CORRECT: Extracted validation
function validateEmail(email: string): void {
  if (!email || !isValidEmail(email)) {
    throw new Error('Invalid email');
  }
}

function createUser(data) {
  validateEmail(data.email);
  // ...
}

function updateUser(id, data) {
  validateEmail(data.email);
  // ...
}
```

### When NOT to Apply DRY

- Accidental similarity (code looks similar but serves different purposes)
- Premature abstraction (only 2 occurrences, might diverge)
- When abstraction adds more complexity than duplication

**Rule of Three**: Wait until you see the third occurrence before abstracting.

---

## YAGNI (You Aren't Gonna Need It)

**Philosophy**: Do not build features or abstractions before they are needed. Start simple, then refactor when the pressure is real.

### Guidelines

- Avoid speculative generality
- Don't add "just in case" features
- Resist the urge to future-proof prematurely
- Add complexity only when you have actual use cases demanding it

### Example

```typescript
// WRONG: Premature abstraction for hypothetical future needs
interface PaymentProcessor {
  process(amount: number): Promise<void>;
  refund(transactionId: string): Promise<void>;
  subscribe(plan: Plan): Promise<void>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}

class StripeProcessor implements PaymentProcessor {
  // Implements all methods, but we only need process() now
}

class PayPalProcessor implements PaymentProcessor {
  // Also implements all methods speculatively
}

// CORRECT: Build what you need now
async function processPayment(amount: number): Promise<void> {
  // Simple implementation for current requirement
  await stripe.charges.create({ amount });
}

// Later, when you actually need multiple processors:
interface PaymentProcessor {
  process(amount: number): Promise<void>;
}
```

### Signs You're Violating YAGNI

- Building interfaces for "potential" future implementations
- Adding configuration options nobody has asked for
- Creating abstraction layers "in case we switch X"
- Implementing features because they'd be "nice to have"

### The Refactoring Safety Net

YAGNI works because you can refactor later. Trust that:
- Clean code is easy to refactor
- Tests give you confidence to change
- It's easier to add complexity than remove it

---

## Balancing the Principles

These principles sometimes tension against each other:

- **DRY vs KISS**: Don't over-abstract to eliminate duplication if it hurts clarity
- **YAGNI vs DRY**: Don't abstract prematurely, but don't ignore obvious duplication
- **KISS vs YAGNI**: Simple now doesn't mean ignoring clear future needs

**Decision framework**:
1. Is it simple? (KISS)
2. Is it duplicated? (DRY - wait for 3 occurrences)
3. Is it needed now? (YAGNI)

When in doubt, favor simplicity and defer decisions.
