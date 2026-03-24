# Skill: React + TypeScript

## Component Pattern
All components live in `src/components/`. Use functional components with typed props.

```typescript
interface MyComponentProps {
  title: string;
  onAction: (id: string) => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  return <div>{title}</div>;
}
```

## shadcn/ui Usage
Import from `@/components/ui/`:
```typescript
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
```

## Path Aliases
Use `@/` for `src/`:
```typescript
import { useSupabaseData } from "@/hooks/useSupabaseData";
```

## Hook Pattern
```typescript
export function useMyHook() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // fetch logic
  }, []);
  
  return { data, loading };
}
```

## Tailwind Styling
Use Tailwind utility classes. Complex/reusable styles go in `src/index.css` as `@layer components`.
