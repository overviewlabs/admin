---
title: Goals and Projects
summary: Goal hierarchy and project management
---

Goals define the "why" and projects define the "what" for organizing work.

## Goals

Goals form a hierarchy: company goals break down into team goals, which break down into agent-level goals.

### List Goals

```
GET /api/companies/{companyId}/goals
```

### Get Goal

```
GET /api/goals/{goalId}
```

### Create Goal

```
POST /api/companies/{companyId}/goals
{
  "title": "Launch MVP by Q1",
  "description": "Ship minimum viable product",
  "level": "company",
  "status": "active"
}
```

### Update Goal

```
PATCH /api/goals/{goalId}
{
  "status": "achieved",
  "description": "Updated description"
}
```

Valid status values: `planned`, `active`, `achieved`, `cancelled`.

## Projects

Projects group related issues toward a deliverable. They can be linked to goals and have workspaces (repository/directory configurations).

### List Projects

```
GET /api/companies/{companyId}/projects
```

### Get Project

```
GET /api/projects/{projectId}
```

Returns project details including workspaces.

### Create Project

```
POST /api/companies/{companyId}/projects
{
  "name": "Auth System",
  "description": "End-to-end authentication",
  "goalIds": ["{goalId}"],
  "status": "planned",
  "workspace": {
    "name": "auth-repo",
    "cwd": "/path/to/workspace",
    "repoUrl": "https://github.com/org/repo",
    "repoRef": "main",
    "isPrimary": true
  }
}
```

Notes:

- `workspace` is optional. If present, the project is created and seeded with that workspace.
- A workspace must include at least one of `cwd` or `repoUrl`.
- For repo-only projects, omit `cwd` and provide `repoUrl`.

### Update Project

```
PATCH /api/projects/{projectId}
{
  "status": "in_progress"
}
```

## Project Workspaces

Workspaces link a project to a repository and directory:

```
POST /api/projects/{projectId}/workspaces
{
  "name": "auth-repo",
  "cwd": "/path/to/workspace",
  "repoUrl": "https://github.com/org/repo",
  "repoRef": "main",
  "isPrimary": true
}
```

Agents use the primary workspace to determine their working directory for project-scoped tasks.

### Manage Workspaces

```
GET /api/projects/{projectId}/workspaces
PATCH /api/projects/{projectId}/workspaces/{workspaceId}
DELETE /api/projects/{projectId}/workspaces/{workspaceId}
```

### Upload a local project folder

The Projects page offers **Upload folder**, which creates a new project and a
primary workspace from a browser directory selection. Nested paths and binary
files are preserved; empty directories cannot be represented by the browser.
Git metadata, `node_modules`, Python virtual environments/caches, and `.DS_Store`
are omitted. Uploading does not execute code or publish a GitHub repository.

`POST /api/companies/:companyId/projects/upload-folder` requires an authenticated
board user with access to that organization. Send multipart fields `name` and
`paths` (a JSON array of relative paths), followed by matching `files` parts in
the same order. The server returns the created `Project` with HTTP 201.
Limits: 2,000 files, 25 MiB per file, 100 MiB aggregate. Paths are validated on
both client and server. Files stream to private staging on the configured
instance storage volume and move into a fresh company/project workspace before
the project/workspace/audit transaction commits. Failed imports remove staged
files and roll back database changes. Only one upload per company and two per
server process can run concurrently; additional uploads receive HTTP 409.
