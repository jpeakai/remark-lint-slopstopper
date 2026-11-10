# Buyer channel overlap

Family detector: `venn`.

```mermaid
---
config:
  themeVariables:
    venn1: '#cbc9ff'
    venn2: '#00b9a6'
    venn3: '#b89f18'
---
venn-beta
set Mobile: 70
set Web: 65
set Store: 40
union Mobile,Web: 25
union Mobile,Store: 12
union Web,Store: 10
union Mobile,Web,Store: 5
```
