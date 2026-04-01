# Form Error Handling & Validation UX Spec

## Core Principles
1. Be specific, not generic — "Purchase price must be greater than 0" not "Something went wrong"
2. Show errors as close to the input as possible
3. Validate on blur or submit, not while typing (unless formatting help)
4. Never clear fields on error
5. Never rely on color alone — always include text + icon
6. Always provide a path to resolution

## Error Types
- **Field-level**: red border + message below field
- **Form-level**: top-of-form alert box with summary + links to fields
- **System errors**: non-technical message + retry button
- **Validation warnings**: yellow/neutral, non-blocking ("This rent seems high for this market")

## Message Style
- Tone: calm, helpful, neutral, no blame
- Structure: [What's wrong] + [How to fix]
- Avoid: "Invalid input", "Error", "Failed"

## File Uploads
- Validate type, size, count before upload
- Show progress bar, allow cancel
- On failure: show retry, don't remove from list

## API Errors
- Auto retry 2-3x for 500s
- Map: 500→"Something went wrong on our end", Timeout→"Taking longer than expected", Network→"Check your connection"
- Never show raw API errors

## Long Tasks (parsing/underwriting)
- Show status: queued → processing → retrying → failed → completed
- On failure: clear message + retry + which file failed

## On Submit with Errors
- Scroll to first error, focus input, highlight section
- Sticky error summary for long forms

## Accessibility
- aria-describedby for error text
- aria-invalid on fields
- Screen reader announces errors
- Keyboard navigation maintained

## Success States
- Always show success clearly: "Saved successfully", "Upload complete", "Project created"

## Global Rule
Every error must answer: What happened? What do I do next?
User should never feel confused, blamed, or stuck.
