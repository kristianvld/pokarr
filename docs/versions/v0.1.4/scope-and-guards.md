# Scope and Guards

Scope and guards are intentionally split because they answer different questions.

## Scope Filters

Use scope filters to say what kind of content belongs to the candidate pool:

- missing content only
- below a quality target
- below a custom format score

Quality and format targets can come either from the rule itself or from the quality profile already assigned to each movie or series.

## Guard Rules

Use guards to reject candidates that should not be nudged yet:

- only monitored content
- minimum release age

## Release Age

Release age uses the release date of the content in scope. For season and series rules, that means the newest episode in that season or series.

## Cooldown

Cooldown is shown as a top-level rule field because it affects scheduling, but it behaves like a guard: items that were nudged recently stay out of the queue until the cooldown expires.

## Example

“Poke full seasons once they have been out for a week, but not the same season more than once per day.”

That becomes:

- target kind: `season`
- minimum release age: `7 days`
- cooldown: `24 hours`
- monitored only: `true`
