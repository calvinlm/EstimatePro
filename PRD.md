# EstimatePro PH

## MVP Product Requirements Document (PRD)

**Product Type:** Web-based Construction Estimating & Quotation System
**Market:** Philippines
**Stage:** MVP (Demo + Iteration-Ready)
**Audience:** Solo Developer, Investors, Stakeholders
**Architecture:** Decoupled Frontend & Backend (REST API)

---

## 1. Executive Summary

EstimatePro PH is a formula-driven construction estimating and quotation application designed for Philippine design-build and construction firms.

The MVP focuses on **accuracy, auditability, and professional client-facing output**, serving as both a working demo and the foundation for iterative SaaS development.

This version prioritizes **trust in numbers** over feature breadth.

---

## 2. Product Vision

To reduce quotation preparation time while increasing confidence and transparency in construction cost estimates by:

* Automating quantity computations using Philippine standards
* Making every number explainable and traceable
* Producing professional, client-ready PDF quotations

---

## 3. MVP Objectives

* Demonstrate accurate formula-based estimation
* Ensure full auditability of computed and adjusted values
* Generate deterministic, professional PDF quotations
* Establish a scalable, API-first foundation for SaaS growth

---

## 4. Target Users

* Quantity surveyors and estimators
* Project managers preparing quotations
* Construction business owners reviewing costs

---

## 5. MVP Scope Definition

### 5.1 In Scope

* Multi-user access within a single organization
* Project and estimate management
* Formula-based quantity computation
* Manual line item adjustments with audit trail
* Versioned estimates
* Professional PDF quotation generation

### 5.2 Out of Scope (MVP)

* Client portals
* Real-time collaboration
* Supplier integrations
* Mobile applications
* Advanced analytics dashboards

---

## 6. Core Product Principles

1. **Accuracy First** – Calculations must follow deterministic rules
2. **Auditability** – All values must be explainable
3. **Immutability** – Historical data is never silently changed
4. **Separation of Concerns** – Frontend and backend are decoupled

---

## 7. System Architecture

### 7.1 Frontend (Client Application)

* React / Next.js
* Handles UI, forms, and data presentation only
* No business logic or financial computation

### 7.2 Backend (API Server)

* Node.js with Express/Fastify
* REST API
* Executes all business logic:

  * Formula computation
  * Cost calculation
  * Audit logging
  * PDF generation

### 7.3 Database

* PostgreSQL
* Accessed exclusively by backend

---

## 8. Core Entities (MVP)

### Organization

* id, name, createdAt

### User

* id, organizationId, name, email, role, createdAt

### Project

* id, organizationId, name, location, projectType, status, timestamps

### Estimate

* id, projectId, versionNumber, status, subtotal, markupRate, vatRate, totalAmount, createdBy, createdAt

### LineItem

* id, estimateId, primaryCategory, description, quantity, unit
* unitMaterialCost, unitLaborCost, totalCost
* calculationSource (manual | computed | adjusted)
* originalComputedQuantity, originalComputedCost
* overrideReason, locked, createdBy, createdAt

### Formula

* id, name, category, version, isActive

### ComputationInstance

* id, estimateId, formulaId, formulaVersion
* inputValues, computedResults, versionHash
* computedBy, computedAt

### AuditLog

* id, entityType, entityId, action
* beforeState, afterState
* performedBy, performedAt

---

## 9. Formula Computation System

### 9.1 Supported Formulas (MVP)

* Concrete Slab
* CHB Wall
* Painting Works

### 9.2 Formula Rules

* Deterministic computation
* Inputs validated before execution
* Original computed values preserved
* Manual adjustments require justification

---

## 10. Cost Calculation Rules

Calculation order:

1. Line item total (material + labor)
2. Category subtotals
3. Estimate subtotal
4. Markup
5. VAT (12%)
6. Grand total

All values rounded to two decimal places for display.

---

## 11. PDF Quotation Requirements

* Fixed, professional layout
* Client and project details
* Itemized breakdown by category
* Clear subtotals, markup, VAT, and total
* Deterministic pagination rules

PDF is treated as a **first-class feature**.

---

## 12. Auditability & Versioning

* All changes logged with user and timestamp
* Estimates are versioned, not overwritten
* Formula changes do not affect existing estimates

---

## 13. Non-Functional Requirements

* Reliable and predictable calculations
* Clear error handling
* Demo-ready performance
* Secure authentication and authorization

---

## 14. Success Criteria (MVP)

* Complete quote created in under 15 minutes
* All formula outputs explainable
* PDF suitable for real client use
* Stakeholders confident in SaaS viability

---

## 15. Technology Stack & Version Constraints

This section defines the **approved technology stack and version boundaries** for the MVP. These constraints exist to ensure compatibility, reproducibility, and demo stability.

### 15.1 Runtime & Package Management

* Node.js: **20.x (LTS)**
* npm: **10.x**

Version enforcement:

* `package.json` engines field
* `.nvmrc` for local development consistency

---

### 15.2 Frontend Stack

* Framework: **Next.js 14.x** (App Router)
* React: **18.x**
* TypeScript: **5.x**

Notes:

* Major versions are pinned
* Patch and minor updates allowed within the same major

---

### 15.3 Backend Stack

* Runtime: Node.js 20.x
* Framework: **Express 4.19.x** or **Fastify 4.x**
* ORM: **Prisma 5.x**

Notes:

* Prisma major version upgrades require explicit review

---

### 15.4 Database

* Database Engine: **PostgreSQL 15.x**

Notes:

* Database accessed exclusively via backend API
* Schema migrations managed through Prisma

---

### 15.5 Supporting Libraries

* Authentication: JWT (`jsonwebtoken`)
* Validation: Zod
* PDF Generation: Chromium-based renderer (Playwright or Puppeteer)
* Password Hashing: bcrypt

---

### 15.6 Versioning Policy

* Major version upgrades are **deliberate decisions**, not automatic
* Demo stability takes priority over bleeding-edge updates
* Version changes must not silently affect existing estimates

---

## 16. Future Iteration Path

* Expanded formula library
* Client portals
* Advanced analytics
* Mobile support
* Multi-organization SaaS deployment

---

**End of Document**
