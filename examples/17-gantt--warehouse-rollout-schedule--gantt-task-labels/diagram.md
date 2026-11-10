# Warehouse rollout schedule

Family detector: `gantt`.

```mermaid
---
config: {"themeVariables":{"taskTextColor":"#fff","taskBkgColor":"#fff"}}
---
gantt
  dateFormat YYYY-MM-DD
  section Preparation
  Inventory audit :audit, 2026-11-02, 3d
  Staff training :train, after audit, 2d
  section Rollout
  Pilot warehouse :pilot, after train, 4d
  Carrier validation :carrier, after pilot, 2d
  Regional launch :launch, after carrier, 1d
```
