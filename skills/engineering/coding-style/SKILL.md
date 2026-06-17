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

```typescript
// WRONG: Mutates original object - hidden side effect
function updateName(user: User, newName: string) {
  user.name = newName;
  return user;
}

// CORRECT: Returns new object - no side effects
function updateName(user: User, newName: string): User {
  return { ...user, name: newName };
}
```

```python
# WRONG: Modifies list in-place
def add_item(items, item):
    items.append(item)
    return items

# CORRECT: Returns new list
def add_item(items, item):
    return items + [item]
```

**Rationale**: Immutable data prevents hidden side effects, makes debugging easier, enables safe concurrency, and simplifies reasoning about code state.

### File Organization

MANY SMALL FILES > FEW LARGE FILES:

- **Size targets**: 200-400 lines typical, 800 lines maximum
- **High cohesion**: Each file has one clear responsibility
- **Low coupling**: Files depend on abstractions, not implementations
- **Feature-based organization**: Group by domain/feature, not by type

```
GOOD structure:
src/
  features/
    auth/
      login.ts        # Login logic (~150 lines)
      signup.ts       # Signup logic (~180 lines)
      validators.ts   # Auth validation (~120 lines)
    cart/
      cart.ts         # Cart operations (~200 lines)
      checkout.ts     # Checkout flow (~250 lines)

BAD structure:
src/
  controllers.ts      # 2000+ lines of everything
  services.ts         # 1500+ lines of everything
  models.ts           # 1000+ lines of everything
```

When a file exceeds 400 lines, ask: "Can I extract a cohesive piece into its own module?"

## Core Principles

### KISS (Keep It Simple)

- Prefer the simplest solution that actually works
- Avoid premature optimization
- Optimize for clarity over cleverness
- If you can't explain it simply, it's too complex

```typescript
// WRONG: Overly clever one-liner
const result = data.filter(x => x.active).map(x => x.value).reduce((a, b) => a + b, 0);

// CORRECT: Clear step-by-step
const activeItems = data.filter(item => item.active);
const values = activeItems.map(item => item.value);
const total = values.reduce((sum, value) => sum + value, 0);
```

### DRY (Don't Repeat Yourself)

- Extract repeated logic into shared functions or utilities
- Avoid copy-paste implementation drift
- Introduce abstractions when repetition is real (3+ occurrences), not speculative

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

### YAGNI (You Aren't Gonna Need It)

- Do not build features or abstractions before they are needed
- Avoid speculative generality
- Start simple, then refactor when the pressure is real

```typescript
// WRONG: Premature abstraction for hypothetical future needs
interface PaymentProcessor {
  process(amount: number): Promise<void>;
  refund(transactionId: string): Promise<void>;
  subscribe(plan: Plan): Promise<void>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}

// CORRECT: Build what you need now
async function processPayment(amount: number): Promise<void> {
  // Simple implementation for current requirement
}
```

Add complexity only when you have actual use cases demanding it.

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

Prefer early returns over nested conditionals once the logic starts stacking (>3 levels).

```typescript
// WRONG: Deep nesting (4 levels)
function processOrder(order: Order) {
  if (order.items.length > 0) {
    if (order.paymentMethod) {
      if (order.paymentMethod.isValid()) {
        if (order.total > 0) {
          return charge(order);
        }
      }
    }
  }
  return null;
}

// CORRECT: Early returns (flat structure)
function processOrder(order: Order) {
  if (order.items.length === 0) return null;
  if (!order.paymentMethod) return null;
  if (!order.paymentMethod.isValid()) return null;
  if (order.total <= 0) return null;
  
  return charge(order);
}
```

### Magic Numbers

Use named constants for meaningful thresholds, delays, and limits.

```typescript
// WRONG: Magic numbers
setTimeout(() => retry(), 5000);
if (items.length > 100) {
  throw new Error('Too many items');
}
const discount = price * 0.15;

// CORRECT: Named constants
const RETRY_DELAY_MS = 5000;
const MAX_ITEMS_PER_ORDER = 100;
const LOYALTY_DISCOUNT_RATE = 0.15;

setTimeout(() => retry(), RETRY_DELAY_MS);
if (items.length > MAX_ITEMS_PER_ORDER) {
  throw new Error(`Exceeded maximum of ${MAX_ITEMS_PER_ORDER} items`);
}
const discount = price * LOYALTY_DISCOUNT_RATE;
```

### Long Functions

Split large functions into focused pieces with clear responsibilities (<50 lines target).

```typescript
// WRONG: Long function doing too much
function processCheckout(cart: Cart) {
  // Validate cart (30 lines)
  // Calculate totals (20 lines)
  // Apply discounts (25 lines)
  // Process payment (30 lines)
  // Update inventory (20 lines)
  // Send confirmation (15 lines)
  // Total: 140 lines
}

// CORRECT: Composed from focused functions
function processCheckout(cart: Cart) {
  validateCart(cart);
  const totals = calculateTotals(cart);
  const finalAmount = applyDiscounts(totals);
  const payment = processPayment(finalAmount);
  updateInventory(cart.items);
  sendConfirmation(payment);
}
```

Each extracted function should:
- Have a single responsibility
- Be testable in isolation
- Have a descriptive name

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
