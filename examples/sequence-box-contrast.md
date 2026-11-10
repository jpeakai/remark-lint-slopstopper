# Sequence contrast across coloured participant groups

These intentionally failing sequences pin a light palette while messages cross coloured participant boxes and the page canvas.
Their connecting lines and arrows must remain measurable in both viewer themes.

## Start and reconcile a Stage Run

```mermaid
%%{init: {"theme": "redux-color", "themeVariables": {"textColor": "#0a0a0a", "edgeLabelBackground": "#ffffff"}}}%%
sequenceDiagram
    box rgb(150, 217, 255) Callers
    actor User
    participant UI as Stage Workspace UI
    end
    box rgb(203, 201, 255) AMC application
    participant Resolver
    participant Service
    end
    box rgb(140, 232, 156) Durable state
    participant Firestore
    end
    box rgb(203, 201, 255) Execution runtime
    participant Worker as AMC worker or Runner
    end
    User->>UI: Start action with Workspace revision and Artifact selection
    UI->>Resolver: authenticated request
    Resolver->>Service: validated command and actor
    Service->>Firestore: transaction: seal Run Request and reserve Workspace
    Firestore-->>Service: committed Run ID
    Service-->>UI: accepted Run
    Service->>Worker: dispatch persisted command
    Worker-->>Service: progress and completion receipt
    Service->>Firestore: persist observation and reconcile lifecycle
    Service->>Service: validate output against declared contract
    alt Valid output
        Service->>Firestore: accept immutable Artifact and update Workspace
    else Failed or invalid output
        Service->>Firestore: record failure or bounded recovery state
    end
```

## Parallel intake and Session turns

```mermaid
%%{init: {"theme": "redux-color", "themeVariables": {"textColor": "#0a0a0a", "edgeLabelBackground": "#ffffff"}}}%%
sequenceDiagram
    box rgb(150, 217, 255) Slack provider
    participant Slack
    end
    box rgb(203, 201, 255) AMC application
    participant Intake as Slack Socket Mode intake
    participant Lookup as Jira lookup
    participant Worker as AMC Session worker
    participant Session as Session service
    end
    box rgb(140, 232, 156) Durable state
    participant Firestore
    end
    Slack->>Intake: addressed new request
    Intake->>Firestore: atomically create Mission, Workspace, first Run and lookup intent
    par Session execution
        Intake->>Worker: launch after commit
        Worker->>Session: connect with per-execution token and fenced connection
        Session->>Firestore: persist Run Request
        Worker-->>Session: completion and output receipt
        Session->>Firestore: accept reply Artifact and finish Run
        Session-->>Slack: post reply using Run-keyed delivery receipt
    and Jira discovery
        Intake->>Lookup: process committed lookup intent independently
        Lookup->>Firestore: save discovery and review state
    end
```
