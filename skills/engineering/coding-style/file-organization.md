# File Organization

## Philosophy

MANY SMALL FILES > FEW LARGE FILES

Small, focused files improve:
- **Discoverability**: Easier to find specific functionality
- **Maintainability**: Changes have limited blast radius
- **Testability**: Each module can be tested independently
- **Reusability**: Small modules are easier to reuse

## Size Guidelines

- **Target**: 200-400 lines per file
- **Maximum**: 800 lines (hard limit)
- **Minimum**: No strict minimum, but avoid excessive fragmentation (<50 lines may indicate over-splitting)

When a file exceeds 400 lines, ask: "Can I extract a cohesive piece into its own module?"

## Organization Strategies

### Feature-Based Organization (PREFERRED)

Group by domain/feature, not by technical type.

```
GOOD structure:
src/
  features/
    auth/
      login.ts        # Login logic (~150 lines)
      signup.ts       # Signup logic (~180 lines)
      validators.ts   # Auth validation (~120 lines)
      types.ts        # Auth-related types
    cart/
      cart.ts         # Cart operations (~200 lines)
      checkout.ts     # Checkout flow (~250 lines)
      calculator.ts   # Price calculation (~100 lines)
  shared/
    utils/
      date.ts
      string.ts
    components/
      Button.tsx
      Input.tsx
```

### Avoid Type-Based Organization

```
BAD structure:
src/
  controllers/        # All controllers together (huge files)
    UserController.ts
    OrderController.ts
    ProductController.ts
  services/           # All services together
    UserService.ts
    OrderService.ts
    ProductService.ts
  models/             # All models together
    User.ts
    Order.ts
    Product.ts
```

**Why feature-based is better**:
- Related code stays together
- Easier to understand feature boundaries
- Simpler to extract or move features
- Better reflects business domains

## Module Extraction Signals

Extract a new module when you see:

1. **Multiple responsibilities**: File handles authentication AND authorization AND session management
2. **Large helper sections**: More than 100 lines of utility functions at the bottom
3. **Clear sub-domains**: A section that could stand alone conceptually
4. **Import clustering**: Many imports used only by one section of the file

### Example: Before Extraction

```typescript
// user-management.ts (600 lines)
import { ... } from '...';

// User CRUD operations (200 lines)
export function createUser() { /* ... */ }
export function getUser() { /* ... */ }
export function updateUser() { /* ... */ }
export function deleteUser() { /* ... */ }

// User validation (150 lines)
export function validateEmail() { /* ... */ }
export function validateUsername() { /* ... */ }
export function checkPasswordStrength() { /* ... */ }

// User permissions (150 lines)
export function hasPermission() { /* ... */ }
export function getRoles() { /* ... */ }
export function assignRole() { /* ... */ }

// User preferences (100 lines)
export function getPreferences() { /* ... */ }
export function updatePreferences() { /* ... */ }
```

### Example: After Extraction

```
features/users/
  operations.ts      # CRUD (~200 lines)
  validators.ts      # Validation (~150 lines)
  permissions.ts     # Permissions (~150 lines)
  preferences.ts     # Preferences (~100 lines)
  index.ts           # Re-export public API
```

```typescript
// index.ts - Clean public API
export { createUser, getUser, updateUser, deleteUser } from './operations';
export { validateEmail, validateUsername } from './validators';
export { hasPermission, assignRole } from './permissions';
export { getPreferences, updatePreferences } from './preferences';
```

## Naming Conventions for Files

- Use descriptive, domain-specific names: `payment-processor.ts` not `utils.ts`
- Avoid generic names: `helpers.ts`, `common.ts`, `misc.ts`
- Index files: Use `index.ts` for module entry points
- Test files: Mirror source structure (`user.test.ts` for `user.ts`)

## Cohesion and Coupling

### High Cohesion

Each file should have one clear responsibility:

```typescript
// GOOD: Focused on email validation
// email-validator.ts
export function isValidEmail(email: string): boolean { /* ... */ }
export function normalizeEmail(email: string): string { /* ... */ }
```

### Low Coupling

Files should depend on abstractions, not implementations:

```typescript
// GOOD: Depends on interface
// payment-service.ts
interface PaymentGateway {
  charge(amount: number): Promise<void>;
}

export class PaymentService {
  constructor(private gateway: PaymentGateway) {}
}

// BAD: Depends on concrete implementation
import { StripeGateway } from './stripe-gateway';
export class PaymentService {
  private gateway = new StripeGateway(); // Hard dependency
}
```

## Directory Structure Patterns

### Flat vs Nested

**Flat** (fewer directories, more files):
```
features/
  auth-login.ts
  auth-signup.ts
  auth-reset-password.ts
```

**Nested** (more directories, fewer files per dir):
```
features/
  auth/
    login.ts
    signup.ts
    reset-password.ts
```

**Preference**: Nested when you have 5+ related files. Flat for 2-4 files.

### Barrel Files (index.ts)

Use barrel files to simplify imports:

```typescript
// features/auth/index.ts
export * from './login';
export * from './signup';
export * from './validators';
```

```typescript
// Usage
import { login, signup } from '@/features/auth';  // Clean!
// Instead of:
import { login } from '@/features/auth/login';
import { signup } from '@/features/auth/signup';
```

**Caution**: Don't over-use barrel files. They can cause circular dependencies and slower builds.

## Anti-Patterns to Avoid

### God Files

❌ Single file doing everything (>800 lines)
✅ Split into focused modules

### Utility Dumping Ground

❌ `utils.ts` with 50 unrelated functions
✅ Domain-specific utility modules (`date-utils.ts`, `string-utils.ts`)

### Premature Modularization

❌ Creating modules for 2-line functions
✅ Extract when complexity or reusability justifies it

### Circular Dependencies

❌ Module A imports B, B imports A
✅ Extract shared code to third module C

## Checklist

When organizing files:

- [ ] Each file <800 lines (ideally 200-400)
- [ ] Files organized by feature/domain
- [ ] Clear, descriptive file names
- [ ] High cohesion (one responsibility per file)
- [ ] Low coupling (depend on abstractions)
- [ ] No utility dumping grounds
- [ ] No circular dependencies
- [ ] Public API clearly exported (via index.ts where appropriate)
