# Order worker stages

Family detector: `block`.

```mermaid
---
config: {"themeVariables":{"textColor":"#fff","mainBkg":"#fff"}}
---
block-beta
  columns 3
  input["Order queue"] worker["Order worker"] output["Shipment queue"]
  validation["Validate payload"] reservation["Reserve inventory"] payment["Authorize payment"]
  input --> worker
  worker --> output
  worker --> validation
  validation --> reservation
  reservation --> payment
```
