---
name: ui-system
description: >
  Enforces Livra's visual design system. Use when creating 
  or modifying any UI component, screen layout, or animation.
user-invocable: false
---

## Livra visual identity

Primary color: Dark green (#[your hex]) — this is non-negotiable.
Do NOT redesign the color system or suggest lighter themes.

Typography: [your font choices]
Spacing scale: [your spacing constants]
Border radius: [your radius values]
Animation: Use Reanimated 2 for all animations. Match the style of 
           the existing Weekly Review screen animations.

## Component patterns
- Cards: rounded corners, subtle shadow, dark green accent
- Buttons: filled primary (dark green), ghost secondary
- Charts: match existing Statistics screen rendering approach
- Empty states: illustration + heading + subtext + CTA

When modifying any component, read the existing implementation first 
and match its patterns before adding anything new.