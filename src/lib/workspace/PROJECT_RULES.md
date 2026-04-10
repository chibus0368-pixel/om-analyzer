# DealSignals Deal Analyzer — Project Rules

## Project Concept
- A project is a **group** for organizing deals — not a single property
- Examples: "Strip Malls", "Dollar General Portfolio", "Austin Retail Q1"
- Properties live inside projects as children
- A project can contain 1 or many properties

## Data Model
- Projects → Properties → Documents → Extracted Fields → Outputs
- Scoreboard shows projects at top level, drill into project to see properties
- Sidebar uses expandable tree: Projects > Properties

## Form Rules
See `form-rules.md` for detailed UX spec. Summary:
- Be specific, not generic with errors
- Validate on blur or submit, not while typing
- Never clear fields on error
- Never rely on color alone — always text + icon
- Always provide path to resolution
- Every error answers: What happened? What do I do next?

## Firestore Rules
- Strip undefined values before saving (use clean() helper)
- Use null instead of undefined for optional fields
- All workspace collections prefixed with `workspace_`

## Auth (current state)
- Firebase Auth enabled but not yet working on custom domain
- Using mock user bypass for now
- Will re-enable when domain auth is resolved

## Asset Types
retail, industrial, office, medical_office, mixed_use, restaurant, auto, bank, pharmacy, dollar_store, convenience, other

## Required Fields for Project Creation
- Project Name (required)
- Asset Type (required)
- Notes (optional)
- That's it. Keep it simple.

## File Upload Rules
- Auto-create project if none selected
- Support: PDF, DOCX, XLS, XLSX, CSV, PNG, JPG, WEBP, TXT
- Auto-detect document category from filename
- Show progress, allow cancel, retry on failure
- Never remove file from list on error

## Outputs per Property
- Pro Forma (XLSX)
- Deal Brief (DOCX)
- Scorecard (PDF)
- Presentation (PPTX)
- Export Package (ZIP)

## Design System
- Primary brand: #C49A3C (gold)
- Dark nav: #0B1120
- Background: #F6F8FB
- Card border: #EDF0F5
- Text: #0B1120 (primary), #5A7091 (secondary), #8899B0 (muted)
- Error: #C52D3A
- Success: #10B981
- Warning: #F59E0B
- Font: Inter (sans), Playfair Display (display)
