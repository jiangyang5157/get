# Immutability

## Core Rule

ALWAYS create new objects, NEVER mutate existing ones.

## Why It Matters

Immutable data prevents hidden side effects, makes debugging easier, enables safe concurrency, and simplifies reasoning about code state.

## Examples

### TypeScript/JavaScript

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

```typescript
// WRONG: Array mutation
function addItem(items: Item[], newItem: Item) {
  items.push(newItem);
  return items;
}

// CORRECT: Return new array
function addItem(items: Item[], newItem: Item): Item[] {
  return [...items, newItem];
}
```

```typescript
// WRONG: Nested object mutation
function updateAddress(user: User, city: string) {
  user.address.city = city;
  return user;
}

// CORRECT: Deep clone with update
function updateAddress(user: User, city: string): User {
  return {
    ...user,
    address: {
      ...user.address,
      city
    }
  };
}
```

### Python

```python
# WRONG: Modifies list in-place
def add_item(items, item):
    items.append(item)
    return items

# CORRECT: Returns new list
def add_item(items, item):
    return items + [item]
```

```python
# WRONG: Modifies dict in-place
def update_config(config, key, value):
    config[key] = value
    return config

# CORRECT: Returns new dict
def update_config(config, key, value):
    return {**config, key: value}
```

## Advanced Patterns

### Using Immutable Libraries

For complex state management, consider libraries like:
- **Immer** (JavaScript): Write "mutating" code that produces immutable results
- **immutable.js** (JavaScript): Persistent data structures
- **frozenlist/frozendict** (Python): Enforce immutability at runtime

### State Updates in React

```typescript
// WRONG: Direct state mutation
setState(prev => {
  prev.items.push(newItem);
  return prev;
});

// CORRECT: Return new state
setState(prev => ({
  ...prev,
  items: [...prev.items, newItem]
}));
```

## Common Pitfalls

1. **Array methods that mutate**: `push`, `pop`, `splice`, `sort`, `reverse`
   - Use: `concat`, `slice`, `[...arr].sort()` instead

2. **Object.assign with same reference**:
   ```typescript
   // WRONG: Still mutates if target is existing object
   Object.assign(existingObj, { field: value });
   
   // CORRECT: Create new object
   const newObj = Object.assign({}, existingObj, { field: value });
   ```

3. **Nested mutations**: Remember to copy all levels that change

## When to Break the Rule

Rare exceptions:
- Performance-critical code with proven bottlenecks (measure first!)
- Interfacing with libraries that require mutation
- Local variables within a single function scope (no external visibility)

Always document why mutation is necessary when you must do it.
