# Code Smells and Anti-Patterns

## Deep Nesting

**Problem**: Nested conditionals beyond 3 levels make code hard to follow and test.

### Solution: Early Returns

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

### Solution: Guard Clauses

```typescript
// WRONG: Nested validation
function registerUser(data) {
  if (data.username) {
    if (data.username.length >= 3) {
      if (data.email) {
        if (isValidEmail(data.email)) {
          // Finally do something...
        }
      }
    }
  }
}

// CORRECT: Guard clauses
function registerUser(data) {
  if (!data.username) throw new Error('Username required');
  if (data.username.length < 3) throw new Error('Username too short');
  if (!data.email) throw new Error('Email required');
  if (!isValidEmail(data.email)) throw new Error('Invalid email');
  
  // Main logic here, no nesting
}
```

### Solution: Extract Functions

```typescript
// WRONG: Complex nested logic
function calculateDiscount(cart) {
  if (cart.items.length > 0) {
    if (cart.user.isPremium) {
      if (cart.total > 100) {
        if (hasCoupon(cart)) {
          // Complex calculation...
        }
      }
    }
  }
}

// CORRECT: Extracted helpers
function calculateDiscount(cart) {
  if (!isEligibleForDiscount(cart)) return 0;
  
  const baseDiscount = getBaseDiscount(cart);
  const couponDiscount = getCouponDiscount(cart);
  return baseDiscount + couponDiscount;
}

function isEligibleForDiscount(cart): boolean {
  return cart.items.length > 0 && 
         cart.user.isPremium && 
         cart.total > 100;
}
```

---

## Magic Numbers

**Problem**: Unnamed numeric literals obscure intent and make maintenance difficult.

### Solution: Named Constants

```typescript
// WRONG: Magic numbers
setTimeout(() => retry(), 5000);
if (items.length > 100) {
  throw new Error('Too many items');
}
const discount = price * 0.15;
const maxRetries = 3;

// CORRECT: Named constants
const RETRY_DELAY_MS = 5000;
const MAX_ITEMS_PER_ORDER = 100;
const LOYALTY_DISCOUNT_RATE = 0.15;
const MAX_RETRY_ATTEMPTS = 3;

setTimeout(() => retry(), RETRY_DELAY_MS);
if (items.length > MAX_ITEMS_PER_ORDER) {
  throw new Error(`Exceeded maximum of ${MAX_ITEMS_PER_ORDER} items`);
}
const discount = price * LOYALTY_DISCOUNT_RATE;
```

### When to Extract Constants

Extract when a number:
- Appears more than once
- Has business meaning (not just implementation detail)
- Might change in the future
- Needs explanation

### Configuration vs Constants

```typescript
// Constants: Fixed values
const MAX_PASSWORD_LENGTH = 128;
const DAYS_IN_WEEK = 7;

// Configuration: Values that might change
const API_TIMEOUT = config.apiTimeout || 30000;
const FEATURE_FLAGS = config.features;
```

---

## Long Functions

**Problem**: Functions exceeding 50 lines often do too much and are hard to understand.

### Solution: Extract Helper Functions

```typescript
// WRONG: Long function doing too much
function processCheckout(cart: Cart) {
  // Validate cart (30 lines)
  if (!cart.items || cart.items.length === 0) {
    throw new Error('Cart is empty');
  }
  for (const item of cart.items) {
    if (!item.productId || !item.quantity) {
      throw new Error('Invalid item');
    }
    if (item.quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    // ... more validation
  }
  
  // Calculate totals (20 lines)
  let subtotal = 0;
  for (const item of cart.items) {
    const product = getProduct(item.productId);
    subtotal += product.price * item.quantity;
  }
  const tax = subtotal * 0.08;
  const shipping = subtotal > 50 ? 0 : 9.99;
  const total = subtotal + tax + shipping;
  
  // Apply discounts (25 lines)
  let discount = 0;
  if (cart.couponCode) {
    const coupon = validateCoupon(cart.couponCode);
    if (coupon.type === 'percentage') {
      discount = subtotal * coupon.value;
    } else if (coupon.type === 'fixed') {
      discount = coupon.value;
    }
    // ... more discount logic
  }
  
  // Process payment (30 lines)
  const paymentMethod = getPaymentMethod(cart.paymentId);
  if (!paymentMethod) {
    throw new Error('Payment method not found');
  }
  const finalAmount = total - discount;
  try {
    await paymentProvider.charge({
      amount: finalAmount,
      currency: 'USD',
      source: paymentMethod.token
    });
  } catch (error) {
    logger.error('Payment failed', error);
    throw new PaymentError('Payment processing failed');
  }
  
  // Update inventory (20 lines)
  for (const item of cart.items) {
    const product = getProduct(item.productId);
    product.stock -= item.quantity;
    saveProduct(product);
  }
  
  // Send confirmation (15 lines)
  const order = createOrder(cart, total, discount);
  sendConfirmationEmail(order, cart.user.email);
  
  return order;
  // Total: 140+ lines
}

// CORRECT: Composed from focused functions
function processCheckout(cart: Cart) {
  validateCart(cart);
  const totals = calculateTotals(cart);
  const finalAmount = applyDiscounts(totals, cart.couponCode);
  const payment = processPayment(finalAmount, cart.paymentId);
  updateInventory(cart.items);
  const order = createOrder(cart, totals, payment);
  sendConfirmation(order, cart.user.email);
  
  return order;
}

function validateCart(cart: Cart): void {
  if (!cart.items || cart.items.length === 0) {
    throw new Error('Cart is empty');
  }
  cart.items.forEach(validateCartItem);
}

function calculateTotals(cart: Cart): Totals {
  const subtotal = cart.items.reduce((sum, item) => {
    const product = getProduct(item.productId);
    return sum + product.price * item.quantity;
  }, 0);
  
  const tax = subtotal * TAX_RATE;
  const shipping = subtotal > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  
  return { subtotal, tax, shipping, total: subtotal + tax + shipping };
}

function applyDiscounts(totals: Totals, couponCode?: string): number {
  if (!couponCode) return totals.total;
  
  const coupon = validateCoupon(couponCode);
  const discount = calculateCouponDiscount(coupon, totals.subtotal);
  return totals.total - discount;
}

function processPayment(amount: number, paymentId: string): Payment {
  const paymentMethod = getPaymentMethod(paymentId);
  if (!paymentMethod) {
    throw new Error('Payment method not found');
  }
  
  try {
    return paymentProvider.charge({
      amount,
      currency: 'USD',
      source: paymentMethod.token
    });
  } catch (error) {
    logger.error('Payment failed', error);
    throw new PaymentError('Payment processing failed');
  }
}
```

### Extraction Guidelines

Each extracted function should:
- Have a single responsibility
- Be testable in isolation
- Have a descriptive name that explains WHAT, not HOW
- Accept parameters for anything that varies
- Return a value (avoid side effects when possible)

### Function Size Targets

- **Ideal**: 10-30 lines
- **Acceptable**: Up to 50 lines
- **Refactor trigger**: Beyond 50 lines
- **Hard limit**: 80 lines (must refactor)

---

## Other Common Smells

### Boolean Parameters

```typescript
// WRONG: Unclear what true/false means
sendEmail(user, true, false);

// CORRECT: Named parameters or separate functions
sendEmail(user, { includeAttachments: true, notifyOnFailure: false });
// Or:
sendEmailWithAttachments(user);
sendEmailWithoutAttachments(user);
```

### Primitive Obsession

```typescript
// WRONG: Using primitives for structured data
function createUser(name: string, email: string, age: number) {
  // What if order changes? Easy to mix up.
}

// CORRECT: Use objects/types
interface UserData {
  name: string;
  email: string;
  age: number;
}

function createUser(data: UserData) {
  // Clear and extensible
}
```

### Comments Explaining Bad Code

```typescript
// WRONG: Comment explaining confusing code
// Check if user is valid and has permission
if (u && u.s && u.s.p) {
  // ...
}

// CORRECT: Clear code that doesn't need explanation
if (user && user.isActive && user.hasPermission) {
  // ...
}
```

**Rule**: If you need a comment to explain WHAT the code does, refactor the code to be clearer. Use comments to explain WHY.

---

## Detection Checklist

Watch for these warning signs:

- [ ] Function has >3 levels of nesting
- [ ] Function exceeds 50 lines
- [ ] Numeric literals appear without explanation
- [ ] Same number appears in multiple places
- [ ] You need comments to understand what code does
- [ ] Function name doesn't clearly describe behavior
- [ ] Boolean parameters make calls ambiguous
- [ ] Passing many primitive parameters (consider object)

When you spot these smells, refactor immediately. Don't let them accumulate.
