# Regional order routing

Family detector: `flowchart-elk`.

```mermaid
---
config: {"themeVariables":{"primaryTextColor":"#fff","primaryColor":"#fff","mainBkg":"#fff"}}
---
flowchart-elk LR
  Web[Web checkout] --> Router[Regional router]
  Mobile[Mobile checkout] --> Router
  Router --> Europe[Europe order API]
  Router --> America[America order API]
  Europe --> Ledger[Global order ledger]
  America --> Ledger
```
