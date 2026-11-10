# Buyer channel overlap

Family detector: `venn`.

```mermaid
---
config: {"themeVariables":{"vennSetTextColor":"#fff","venn1":"#fff","venn2":"#fff","venn3":"#fff"}}
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
