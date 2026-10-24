# Five policy violations

The parser reads every input because the worker validates each request, and the service stores all results while the client waits for the response to arrive. The parser creates nodes. Those nodes preserve positions. The service stores requests. Requests contain messages. The service validates messages.

```mermaid
flowchart LR
  N0-->N1-->N2-->N3-->N4-->N5-->N6-->N7-->N8-->N9
  N9-->N10-->N11-->N12-->N13-->N14-->N15-->N16-->N17
  N17-->N18-->N19-->N20-->N21-->N22-->N23-->N24-->N25
  style N0 fill:#ffffff,color:#ffffff
```
