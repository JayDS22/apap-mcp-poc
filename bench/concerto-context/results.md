# Concerto-context A/B results

Model: `claude-sonnet-4-6`
Runs aggregated: 1

## Aggregate

| Variant   | Mean score | N  |
| --------- | ---------- | -- |
| control   | 0.800      | 10 |
| treatment | 1.000      | 10 |

## By category

| Category         | Control | Treatment | Delta  |
| ---------------- | ------- | --------- | ------ |
| schema-knowledge | 0.700   | 1.000     | +0.300 |
| tool-use         | 1.000   | 1.000     | +0.000 |
| mixed            | 0.750   | 1.000     | +0.250 |

## Per query

| Query                       | Control | Treatment | Delta  |
| --------------------------- | ------- | --------- | ------ |
| schema-q1-template-class    | 0.500   | 1.000     | +0.500 |
| schema-q2-agreement-fields  | 0.000   | 1.000     | +1.000 |
| schema-q3-trigger-types     | 1.000   | 1.000     | +0.000 |
| schema-q4-class-discriminator | 1.000   | 1.000     | +0.000 |
| schema-q5-model-element     | 1.000   | 1.000     | +0.000 |
| tool-q1-get-agreement       | 1.000   | 1.000     | +0.000 |
| tool-q2-get-template        | 1.000   | 1.000     | +0.000 |
| tool-q3-convert-html        | 1.000   | 1.000     | +0.000 |
| mixed-q1-fetch-and-classify | 0.500   | 1.000     | +0.500 |
| mixed-q2-fetch-and-explain  | 1.000   | 1.000     | +0.000 |

## Sample outputs

### schema-q1-template-class

**control** (score 0.500, tools: `[getTemplate, getTemplate, getTemplate]`)

> Unfortunately, I wasn't able to retrieve a Template object — all attempts returned an internal error, likely because I was guessing at template IDs without a known valid one.
> 
> To answer your question accurately, I'd need a **valid template ID** to fetch a real Template object and inspect its `$class` field. Could you provide one? For example:
> 
> - A specific template ID you're working with (e.g., `"late-payment-penalty@1.0.0"`)
> - Or any agreement ID, which I can use to look up its associated template
> 
> Once I have a valid ID, I can retrieve the object and show you the exact `$class` discriminator string.

**treatment** (score 1.000, tools: `[]`)

> Based on the Concerto protocol model provided, a **Template** object is identified by the following `$class` discriminator string:
> 
> ```
> org.accordproject.protocol@1.0.0.Template
> ```
> 
> This is derived from the namespace and concept name defined in the model:
> 
> - **Namespace:** `org.accordproject.protocol@1.0.0`
> - **Concept name:** `Template`
> 
> In Concerto, the `$class` discriminator is always the **fully qualified type name**, formed by combining the namespace with the concept name using a `.` separator.

### schema-q2-agreement-fields

**control** (score 0.000, tools: `[]`)

> Let me look up the Agreement type for you. I'll need to find a template to examine its model. Could you provide a **template ID** or **agreement ID** so I can retrieve the relevant model and inspect the `Agreement` type?

**treatment** (score 1.000, tools: `[]`)

> Based on the Concerto protocol model provided in my system context, here is a full breakdown of every field carried by the **`Agreement`** concept:
> 
> ---
> 
> ### `Agreement` — identified by `uri`
> 
> | Field | Type | Required | Notes |
> |---|---|---|---|
> | `uri` | `URI` (scalar String) | ✅ Yes | Unique identifier for the agreement |
> | `data` | `JSON` (scalar String) | ✅ Yes | Instance data conforming to the template's model type |
> | `template` | → `Template` (relationship) | ✅ Yes | Reference to the template this agreement is an instance of |
> | `state` | `JSON` (scalar String) | ❌ Optional | Runtime state of the agreement |
> | `agreementStatus` | `AgreementStatusType` (enum) | ✅ Yes | Current status: `DRAFT`, `SIGNNG`, `COMPLETED`, or `SUPERSEDED` |
> | `agreementParties` | `AgreementParty[]` | ❌ Opt

### schema-q3-trigger-types

**control** (score 1.000, tools: `[]`)

> I'd be happy to help explain the relationship between `TriggerRequest` and `TriggerResponse`, but I'll need to look at a specific template or agreement to do so. Could you please provide me with a **template ID** or **agreement ID** for the protocol you're referring to? That way I can retrieve the relevant model and give you an accurate description.

**treatment** (score 1.000, tools: `[]`)

> Based on the Concerto protocol model provided directly in my context, here is a description of the relationship between `TriggerRequest` and `TriggerResponse`:
> 
> ---
> 
> ## `TriggerRequest` and `TriggerResponse`
> 
> These two concepts form the **input/output pair** for executing (or "triggering") the logic of an agreement. They are not formally linked by a Concerto relationship (`-->`) but are **semantically coupled** as the request and response of the same operation.
> 
> ---
> 
> ### `TriggerRequest`
> ```
> concept TriggerRequest {
>     o JSON payload
> }
> ```
> - Wraps a **JSON payload** to be sent to an agreement's logic engine.
> - The `payload` must conform to one of the **transaction types** that extend `Request` as defined in the agreement's template model.
> - It is the **input** to the trigger operation.
> 
> -

### schema-q4-class-discriminator

**control** (score 1.000, tools: `[]`)

> The `$class` field is not something I can directly answer from documentation or built-in knowledge about this specific server. However, I can investigate by retrieving an example agreement or template to observe the structure of the returned JSON objects. Let me look into this for you!
> 
> That said, based on common patterns in **Accord Project** (which this server appears to be part of), the `$class` field is a **fully qualified type identifier** used in the **Concerto modeling language**. It signifies:
> 
> 1. **The type/class of the object** – It identifies which class (defined in a Concerto model) the JSON object is an instance of.
> 2. **Namespace + Class Name** – The value is typically in the format `namespace.ClassName` (e.g., `org.accordproject.payment.PaymentRequest`), combining the model'

**treatment** (score 1.000, tools: `[]`)

> The `$class` field is a **Concerto discriminator** that identifies the **fully qualified type** of a JSON object returned from the server.
> 
> Specifically, it tells you:
> 
> 1. **The type of the object** – It maps the JSON object to a specific concept, participant, transaction, or enum defined in a Concerto model. For example:
>    - `"$class": "org.accordproject.protocol@1.0.0.Template"` → the object is a `Template`
>    - `"$class": "org.accordproject.protocol@1.0.0.Agreement"` → the object is an `Agreement`
> 
> 2. **The namespace and version** – The value is a *fully qualified type name* (FQTN) in the format:
>    ```
>    <namespace>@<version>.<TypeName>
>    ```
>    This tells you exactly which version of which namespace the type belongs to, avoiding ambiguity across different models or versions.
> 
> 3. **

### schema-q5-model-element

**control** (score 1.000, tools: `[]`)

> Great question! Let me look up both an agreement and a template to compare them. However, I don't have any specific IDs to look up right now — and I can only retrieve these elements **by ID** using the available tools.
> 
> Could you provide:
> 1. An **Agreement ID** to look up
> 2. A **Template ID** to look up
> 
> Once you supply those, I can retrieve both and give you a detailed, concrete comparison of what each model element contains and how they differ.
> 
> That said, based on the available tools alone, I can already offer some **conceptual distinctions**:
> 
> ---
> 
> ### 🔍 Agreement vs. Template — Conceptual Difference
> 
> | Feature | **Template** | **Agreement** |
> |---|---|---|
> | **What it is** | A reusable blueprint or definition | A specific instance created from a template |
> | **Contains** | Logic, mod

**treatment** (score 1.000, tools: `[]`)

> Great question! No, **Agreement** and **Template** are not the same kind of model element. Here's a breakdown of each:
> 
> ---
> 
> ### 🗂️ `Template` — a `concept`
> 
> ```
> @resource
> @description("An Accord Project template")
> concept Template identified by uri { ... }
> ```
> 
> `Template` is a **concept** in the Concerto model. Specifically, it is a **resource concept** (annotated with `@resource`) that is **identified by** its `uri` field. In Concerto:
> 
> - A **concept** is a structured data type — essentially a class with fields but **no transactional or participant semantics**.
> - Being `identified by` means it is a **uniquely identifiable entity** (like a keyed record), distinguishable by its `uri`.
> - The `@resource` annotation marks it as a top-level, independently addressable resource.
> 
> `Template` rep

### tool-q1-get-agreement

**control** (score 1.000, tools: `[getAgreement]`)

> Here are the details of the agreement with ID **1**:
> 
> - **ID:** 1
> - **URI:** `apap://bench-agreement`
> - **Status:** DRAFT
> - **Template:** `bench` (from `org.accordproject.protocol@1.0.0`)
> - **Class:** `io.bench@1.0.0.TemplateModel`
> - **Clause ID:** `bench-1`
> - **Template Hash:** N/A
> - **State:** N/A
> - **Agreement Parties:** N/A
> - **Signatures:** N/A
> - **History Entries:** N/A
> - **Attachments:** N/A
> 
> The agreement is currently in **DRAFT** status and is associated with the `bench` template.

**treatment** (score 1.000, tools: `[getAgreement]`)

> Here are the details of the agreement with ID **1**:
> 
> | Field | Value |
> |---|---|
> | **URI** | `apap://bench-agreement` |
> | **Template** | `bench` |
> | **Status** | `DRAFT` |
> | **State** | None |
> | **Parties** | None |
> | **Signatures** | None |
> | **History Entries** | None |
> | **Attachments** | None |
> 
> **Data:**
> - **Class:** `io.bench@1.0.0.TemplateModel`
> - **Clause ID:** `bench-1`
> 
> The agreement is currently in **DRAFT** status, meaning no signatories have signed it yet. It is an instance of the `bench` template and contains minimal data at this stage.

### tool-q2-get-template

**control** (score 1.000, tools: `[getTemplate]`)

> Here are the details for **Template #1**:
> 
> - **ID:** 1
> - **Display Name:** Bench Template
> - **Author:** bench
> - **Version:** 1.0.0
> - **Description:** bench
> - **License:** Apache-2.0
> - **Keywords:** bench
> - **Template Type:** Clause
> - **Runtime:** TypeScript
> - **Cicero Version:** 0.25.x
> - **Template Text:** bench
> 
> This appears to be a basic bench template. Let me know if you'd like to do anything further with it!

**treatment** (score 1.000, tools: `[getTemplate]`)

> Here are the details for **Template #1**:
> 
> | Field | Value |
> |---|---|
> | **URI** | `resource:org.accordproject.protocol@1.0.0.Template#bench` |
> | **Display Name** | Bench Template |
> | **Author** | bench |
> | **Version** | 1.0.0 |
> | **Description** | bench |
> | **License** | Apache-2.0 |
> | **Keywords** | bench |
> | **Template Type** | clause |
> | **Runtime** | TypeScript |
> | **Cicero Version** | 0.25.x |
> | **Template Model Type** | Bench |
> | **Template Text** | bench |
> | **Logic** | None |
> | **Sample Request** | None |
> 
> This is a simple "Bench" template with no logic or sample request defined. It uses TypeScript as its runtime and is a clause-type template.

### tool-q3-convert-html

**control** (score 1.000, tools: `[convert-agreement-to-format]`)

> Agreement 1 has been successfully converted to HTML format! Here's a summary of the output:
> 
> - **Title:** Bench Template
> - **Status:** DRAFT
> - **Agreement Data:**
>   - **Class:** `io.bench@1.0.0.TemplateModel`
>   - **Clause ID:** `bench-1`
> 
> The HTML includes basic styling with a clean layout, a status badge, and the agreement data displayed in a formatted code block. Let me know if you need anything else!

**treatment** (score 1.000, tools: `[convert-agreement-to-format]`)

> Agreement 1 has been successfully converted to HTML format! Here's a summary of what was returned:
> 
> - **Title:** Bench Template
> - **Status:** DRAFT
> - **Agreement Data:** An instance of `io.bench@1.0.0.TemplateModel` with a `clauseId` of `"bench-1"`.
> 
> The HTML includes basic styling (sans-serif font, a styled status badge, and a code block for the agreement data) and is ready to be rendered in a browser or embedded in a web page. Let me know if you need anything else!

### mixed-q1-fetch-and-classify

**control** (score 0.500, tools: `[getAgreement]`)

> Agreement 1 carries the following `$class`:
> 
> **`io.bench@1.0.0.TemplateModel`**
> 
> This value is found within the `data` object of the agreement, identifying the data model class associated with this agreement's template.

**treatment** (score 1.000, tools: `[getAgreement]`)

> Agreement 1 carries the `$class`:
> 
> > **`org.accordproject.protocol@1.0.0.Agreement`**
> 
> This is inferred from the Concerto protocol model — the resource returned is an instance of the `Agreement` concept (identified by its `uri: "apap://bench-agreement"`), which is defined in the `org.accordproject.protocol@1.0.0` namespace.
> 
> Additionally, the **nested `data` object** inside the agreement carries its own `$class`:
> 
> > **`io.bench@1.0.0.TemplateModel`**
> 
> This represents the specific template data model instance associated with this agreement.

### mixed-q2-fetch-and-explain

**control** (score 1.000, tools: `[getTemplate]`)

> Here's a breakdown of **Template 1** and its Concerto model:
> 
> ---
> 
> ### 📄 Template Overview
> - **ID:** 1
> - **Display Name:** Bench Template
> - **Author:** bench
> - **Version:** 1.0.0
> - **Type:** Clause
> - **License:** Apache-2.0
> 
> ---
> 
> ### 🧩 Concerto Model Explanation
> 
> The `templateModel` field describes the data model for this template using the **Concerto modeling language**. Here's what it contains:
> 
> ```json
> {
>   "$class": "org.accordproject.protocol@1.0.0.TemplateModel",
>   "typeName": "Bench",
>   "model": {
>     "$class": "org.accordproject.protocol@1.0.0.CtoModel",
>     "ctoFiles": []
>   }
> }
> ```
> 
> #### Key Points:
> 
> 1. **`$class: org.accordproject.protocol@1.0.0.TemplateModel`**
>    This object is an instance of the `TemplateModel` concept defined in the `org.accordproject.protocol` namespace at 

**treatment** (score 1.000, tools: `[getTemplate]`)

> Here's a breakdown of what was returned and how it maps to the Concerto model:
> 
> ---
> 
> ## 🧩 What Kind of Object Is It?
> 
> The returned object is a **`Template`** — specifically an instance of:
> 
> ```
> org.accordproject.protocol@1.0.0.Template
> ```
> 
> ---
> 
> ## 📐 Concerto Model Definition
> 
> In the APAP Concerto model, `Template` is defined as:
> 
> ```concerto
> @resource
> @description("An Accord Project template")
> concept Template identified by uri {
>     o URI uri
>     o String author
>     o String displayName optional
>     o String version
>     o String description optional
>     o String license
>     o String[] keywords optional
>     o TemplateMetadata metadata
>     o Blob logo optional
>     o TemplateModel templateModel
>     o Text text
>     o Logic logic optional
>     o JSON sampleRequest optional
> }
> ```
> 
> Key charact

