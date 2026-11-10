# Loan underwriting decisions

The overview links to complete decision details below.
Dashed nodes identify boundaries with another view.

## Overview

```mermaid
---
config:
  layout: dagre
  look: classic
  theme: base
  themeVariables:
    textColor: '#0a0a0a'
    primaryTextColor: '#0a0a0a'
    edgeLabelBackground: '#ffffff'
    lineColor: '#737373'
---
flowchart TB
  start(["Application received"])
  g5[["Identity verified? (+3)"]]
  g3[["Sanctions list hit? (+3)"]]
  bureau["Pull credit bureau file"]
  g2[["Thin file? (+10)"]]
  income["Verify income"]
  g1[["Debt-to-income under 40%? (+5)"]]
  g4[["Fraud model flags? → Risk-based pricing (+3)"]]
  large{"Amount above 50k?"}
  offer["Issue offer"]
  senior["Senior underwriter sign-off"]
  esign{"E-signed within 30 days?"}
  signed{"Signed off?"}
  disburse(["Disburse funds"])
  expired(["Offer expired"])
  declinesenior(["Decline: underwriter"])
  start --> g5
  g5 -->|"Yes"| g3
  g3 --> bureau
  bureau --> g2
  g2 -->|"Yes"| income
  income --> g1
  g1 -->|"Yes"| g4
  g4 --> large
  large -->|"No"| offer
  large -->|"Yes"| senior
  offer --> esign
  senior --> signed
  esign -->|"Yes"| disburse
  esign -->|"No"| expired
  signed -->|"Yes"| offer
  signed -->|"No"| declinesenior
  classDef decision fill:#eacf5a,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef process fill:#cbc9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef outcome fill:#8ce89c,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef rejection fill:#ffbac2,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef boundary fill:#96d9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  linkStyle default stroke:#737373,stroke-width:2px
  class start,disburse outcome
  class g5,g3,bureau,g2,income,g1,g4,offer,senior process
  class large,esign,signed decision
  class expired,declinesenior rejection
```

## Affordability (g1)

```mermaid
---
config:
  layout: dagre
  look: classic
  theme: base
  themeVariables:
    textColor: '#0a0a0a'
    primaryTextColor: '#0a0a0a'
    edgeLabelBackground: '#ffffff'
    lineColor: '#737373'
---
flowchart TB
  s2(["Verify income"])
  dti{"Debt-to-income under 40%?"}
  reduce{"Lower amount fits DTI?"}
  s1(["Fraud model flags?"])
  counter["Counter-offer lower amount"]
  declinedti(["Decline: affordability"])
  accept{"Applicant accepts?"}
  withdrawn(["Withdrawn"])
  s2 --> dti
  dti -->|"No"| reduce
  dti -->|"Yes"| s1
  reduce -->|"Yes"| counter
  reduce -->|"No"| declinedti
  counter --> accept
  accept -->|"Yes"| s1
  accept -->|"No"| withdrawn
  classDef stub stroke-dasharray:4
  class s1,s2 stub
  classDef decision fill:#eacf5a,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef process fill:#cbc9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef outcome fill:#8ce89c,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef rejection fill:#ffbac2,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef boundary fill:#96d9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  linkStyle default stroke:#737373,stroke-width:2px
  class s2,s1 boundary
  class dti,reduce,accept decision
  class counter process
  class declinedti,withdrawn rejection
```

## Credit history and collateral (g2)

```mermaid
---
config:
  layout: dagre
  look: classic
  theme: base
  themeVariables:
    textColor: '#0a0a0a'
    primaryTextColor: '#0a0a0a'
    edgeLabelBackground: '#ffffff'
    lineColor: '#737373'
---
flowchart TB
  s1(["Pull credit bureau file"])
  thin{"Thin file?"}
  alt["Score with open banking data"]
  score{"Bureau score above 680?"}
  altscore{"Alt score above 620?"}
  s2(["Verify income"])
  score2{"Score above 600?"}
  declinethin(["Decline: insufficient history"])
  declinescore(["Decline: credit score"])
  secured{"Offer secured product?"}
  collat["Collateral valuation"]
  ltv{"LTV under 80%?"}
  declineltv(["Decline: collateral"])
  s1 --> thin
  thin -->|"Yes"| alt
  thin -->|"No"| score
  alt --> altscore
  score -->|"Yes"| s2
  score -->|"No"| score2
  altscore -->|"Yes"| s2
  altscore -->|"No"| declinethin
  score2 -->|"No"| declinescore
  score2 -->|"Yes"| secured
  secured -->|"No"| declinescore
  secured -->|"Yes"| collat
  collat --> ltv
  ltv -->|"Yes"| s2
  ltv -->|"No"| declineltv
  classDef stub stroke-dasharray:4
  class s1,s2 stub
  classDef decision fill:#eacf5a,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef process fill:#cbc9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef outcome fill:#8ce89c,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef rejection fill:#ffbac2,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef boundary fill:#96d9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  linkStyle default stroke:#737373,stroke-width:2px
  class s1,s2 boundary
  class thin,score,altscore,score2,secured,ltv decision
  class alt,collat process
  class declinethin,declinescore,declineltv rejection
```

## Sanctions (g3)

```mermaid
---
config:
  layout: dagre
  look: classic
  theme: base
  themeVariables:
    textColor: '#0a0a0a'
    primaryTextColor: '#0a0a0a'
    edgeLabelBackground: '#ffffff'
    lineColor: '#737373'
---
flowchart TB
  s1(["Identity verified? (+3)"])
  sanctions{"Sanctions list hit?"}
  compliance["Refer to compliance"]
  s2(["Pull credit bureau file"])
  compok{"Compliance clears?"}
  declinesan(["Decline: sanctions"])
  s1 -->|"Yes"| sanctions
  sanctions -->|"Yes"| compliance
  sanctions -->|"No"| s2
  compliance --> compok
  compok -->|"Yes"| s2
  compok -->|"No"| declinesan
  classDef stub stroke-dasharray:4
  class s1,s2 stub
  classDef decision fill:#eacf5a,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef process fill:#cbc9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef outcome fill:#8ce89c,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef rejection fill:#ffbac2,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef boundary fill:#96d9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  linkStyle default stroke:#737373,stroke-width:2px
  class s1,s2 boundary
  class sanctions,compok decision
  class compliance process
  class declinesan rejection
```

## Fraud and pricing (g4)

```mermaid
---
config:
  layout: dagre
  look: classic
  theme: base
  themeVariables:
    textColor: '#0a0a0a'
    primaryTextColor: '#0a0a0a'
    edgeLabelBackground: '#ffffff'
    lineColor: '#737373'
---
flowchart TB
  s1(["Debt-to-income under 40%? (+5)"])
  fraud{"Fraud model flags?"}
  manual["Manual fraud review"]
  pricing["Risk-based pricing"]
  fraudok{"Reviewer clears?"}
  s2(["Amount above 50k?"])
  declinefraud(["Decline: fraud"])
  s1 -->|"Yes"| fraud
  fraud -->|"Yes"| manual
  fraud -->|"No"| pricing
  manual --> fraudok
  pricing --> s2
  fraudok -->|"Yes"| pricing
  fraudok -->|"No"| declinefraud
  classDef stub stroke-dasharray:4
  class s1,s2 stub
  classDef decision fill:#eacf5a,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef process fill:#cbc9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef outcome fill:#8ce89c,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef rejection fill:#ffbac2,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef boundary fill:#96d9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  linkStyle default stroke:#737373,stroke-width:2px
  class s1,s2 boundary
  class fraud,fraudok decision
  class manual,pricing process
  class declinefraud rejection
```

## Identity (g5)

```mermaid
---
config:
  layout: dagre
  look: classic
  theme: base
  themeVariables:
    textColor: '#0a0a0a'
    primaryTextColor: '#0a0a0a'
    edgeLabelBackground: '#ffffff'
    lineColor: '#737373'
---
flowchart TB
  s2(["Application received"])
  kyc{"Identity verified?"}
  kycdoc["Request ID documents"]
  s1(["Sanctions list hit?"])
  kycwait{"Documents within 14 days?"}
  declinekyc(["Decline: identity"])
  s2 --> kyc
  kyc -->|"No"| kycdoc
  kyc -->|"Yes"| s1
  kycdoc --> kycwait
  kycwait -->|"Yes"| kyc
  kycwait -->|"No"| declinekyc
  classDef stub stroke-dasharray:4
  class s1,s2 stub
  classDef decision fill:#eacf5a,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef process fill:#cbc9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef outcome fill:#8ce89c,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef rejection fill:#ffbac2,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef boundary fill:#96d9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  linkStyle default stroke:#737373,stroke-width:2px
  class s2,s1 boundary
  class kyc,kycwait decision
  class kycdoc process
  class declinekyc rejection
```
