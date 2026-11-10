# Reservation lifecycle

Family detector: `state`.

```mermaid
---
config:
  layout: dagre
  look: classic
  theme: base
  themeVariables:
    primaryTextColor: '#0a0a0a'
    primaryColor: '#ffffff'
    mainBkg: '#ffffff'
    textColor: '#0a0a0a'
    lineColor: '#737373'
    edgeLabelBackground: '#ffffff'
---
stateDiagram-v2
  [*] --> Pending
  Pending --> Held : inventory reserved
  Pending --> Rejected : no stock
  Held --> Confirmed : payment authorized
  Held --> Released : payment declined
  Held --> Expired : fifteen minutes elapsed
  Confirmed --> [*]
  Rejected --> [*]
  Released --> [*]
  Expired --> [*]
  classDef pending fill:#96d9ff,color:#0a0a0a,stroke:#266d97,stroke-width:2px
  classDef held fill:#cbc9ff,color:#0a0a0a,stroke:#675b99,stroke-width:2px
  classDef accepted fill:#8ce89c,color:#0a0a0a,stroke:#30743b,stroke-width:2px
  classDef failure fill:#ffbac2,color:#0a0a0a,stroke:#91434e,stroke-width:2px
  classDef released fill:#eacf5a,color:#0a0a0a,stroke:#726819,stroke-width:2px
  class Pending pending
  class Held held
  class Confirmed accepted
  class Rejected failure
  class Released,Expired released
```
